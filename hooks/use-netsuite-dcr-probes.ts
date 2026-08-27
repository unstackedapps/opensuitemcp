"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NetSuiteDcrProbeState } from "@/components/netsuite-integration-setup-card";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";

type UseNetSuiteDcrProbesOptions = {
  enabled?: boolean;
  getAccountLabel?: (accountId: string) => string | undefined;
  onProbeReady?: (accountId: string, clientId: string) => void | Promise<void>;
};

export function getDcrProbeForAccount(
  probes: Record<string, NetSuiteDcrProbeState>,
  accountId: string,
): NetSuiteDcrProbeState {
  const normalized = normalizeNetSuiteAccountId(accountId);
  if (!normalized) {
    return { status: "idle" };
  }
  return probes[normalized] ?? { status: "idle" };
}

export function useNetSuiteDcrProbes(
  accountIds: string[],
  options: UseNetSuiteDcrProbesOptions = {},
) {
  const { enabled = true, getAccountLabel, onProbeReady } = options;
  const [probes, setProbes] = useState<Record<string, NetSuiteDcrProbeState>>(
    {},
  );
  const requestIdsRef = useRef<Record<string, number>>({});
  const getAccountLabelRef = useRef(getAccountLabel);
  const onProbeReadyRef = useRef(onProbeReady);

  getAccountLabelRef.current = getAccountLabel;
  onProbeReadyRef.current = onProbeReady;

  const setProbe = useCallback(
    (accountId: string, state: NetSuiteDcrProbeState) => {
      const normalized = normalizeNetSuiteAccountId(accountId);
      if (!normalized) {
        return;
      }
      setProbes((previous) => ({ ...previous, [normalized]: state }));
    },
    [],
  );

  const probeAccount = useCallback(
    async (accountId: string) => {
      const normalized = normalizeNetSuiteAccountId(accountId);
      if (!normalized) {
        return;
      }

      const requestId = (requestIdsRef.current[normalized] ?? 0) + 1;
      requestIdsRef.current[normalized] = requestId;
      setProbe(normalized, { status: "probing" });

      const label = getAccountLabelRef.current?.(normalized) ?? normalized;

      try {
        const response = await fetch("/api/netsuite/probe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: normalized,
            label,
          }),
        });
        const data = await response.json().catch(() => ({}));

        if (requestIdsRef.current[normalized] !== requestId) {
          return;
        }

        if (!response.ok) {
          setProbe(normalized, {
            status: "error",
            error: data.error || "Failed to check NetSuite integration",
          });
          return;
        }

        if (data.status === "ready") {
          setProbe(normalized, { status: "ready", clientId: data.clientId });
          await onProbeReadyRef.current?.(normalized, data.clientId);
          return;
        }

        if (data.status === "needs_integration") {
          setProbe(normalized, {
            status: "needs_integration",
            accountId: data.accountId,
            integrationUrl: data.integrationUrl,
            redirectUri: data.redirectUri,
            dcrClientName: data.dcrClientName,
            checklist: data.checklist ?? [],
          });
          return;
        }

        setProbe(normalized, {
          status: "error",
          error: data.error || "Unexpected probe response",
        });
      } catch (error) {
        if (requestIdsRef.current[normalized] !== requestId) {
          return;
        }
        setProbe(normalized, {
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "Failed to check NetSuite integration",
        });
      }
    },
    [setProbe],
  );

  const accountIdsKey = accountIds
    .map((accountId) => normalizeNetSuiteAccountId(accountId))
    .filter((accountId): accountId is string => Boolean(accountId))
    .sort((left, right) => left.localeCompare(right))
    .join(",");

  useEffect(() => {
    if (!enabled || !accountIdsKey) {
      return;
    }

    for (const accountId of accountIdsKey.split(",")) {
      void probeAccount(accountId);
    }
  }, [accountIdsKey, enabled, probeAccount]);

  return { probes, probeAccount, setProbe };
}
