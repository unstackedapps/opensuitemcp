"use client";

import {
  Clock,
  Cloud,
  ExternalLink,
  Globe,
  type LucideIcon,
  Sparkles,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { AiProviderSettings } from "@/components/ai-provider-settings";
import { LoaderIcon } from "@/components/icons";
import {
  NetSuiteConnectPanel,
  type NetSuiteDcrProbeState,
} from "@/components/netsuite-connect-panel";
import { useAppPortal } from "@/components/portal/context";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  type AiProviderConfig,
  ensureSeededProviderConfig,
  parseAiProviderConfig,
} from "@/lib/ai/provider-entries";
import { getSearchDomainUrl, searchDomains } from "@/lib/ai/search-domains";
import { guestRegex } from "@/lib/constants";
import type { NetSuiteAccountEntry } from "@/lib/netsuite/accounts";
import {
  getNetSuiteNewIntegrationUrl,
  isNetSuiteAccountConnected,
  normalizeNetSuiteAccountId,
} from "@/lib/netsuite/accounts";
import { ORACLE_DOC_LINKS } from "@/lib/netsuite/integration-checklist";
import { toast } from "./toast";

export type SettingsPanelSection =
  | "provider"
  | "netsuite"
  | "search"
  | "timezone"
  | "account";

type PortalPanelHeaderProps = {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  docsLinks?: { label: string; href: string }[];
};

function PortalPanelHeader({
  icon: Icon,
  title,
  subtitle,
  docsLinks,
}: PortalPanelHeaderProps) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-border/60 border-b py-3 pl-4 pr-8 sm:pl-5 sm:pr-9">
      <div className="min-w-0 space-y-1">
        <p className="flex items-center gap-1.5 font-medium text-sm">
          <Icon className="size-3.5 text-muted-foreground" />
          {title}
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {subtitle}
        </p>
      </div>
      {docsLinks && docsLinks.length > 0 ? (
        <div className="hidden shrink-0 flex-col gap-1 text-xs sm:flex">
          {docsLinks.map((link) => (
            <a
              className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              href={link.href}
              key={link.href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {link.label}
              <ExternalLink className="size-3" />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const PROVIDER_DOCS: Record<
  "google" | "anthropic" | "openai" | "custom",
  { label: string; href: string }
> = {
  custom: {
    label: "OpenAI-compatible APIs",
    href: "https://platform.openai.com/docs/api-reference",
  },
  openai: {
    label: "OpenAI models",
    href: "https://platform.openai.com/docs/models",
  },
  anthropic: {
    label: "Anthropic models",
    href: "https://docs.anthropic.com/en/docs/about-claude/models",
  },
  google: {
    label: "Google models",
    href: "https://ai.google.dev/gemini-api/docs/models",
  },
};

const SECTION_META: Record<
  SettingsPanelSection,
  {
    icon: LucideIcon;
    title: string;
    subtitle: string;
    docsLinks?: { label: string; href: string }[];
  }
> = {
  provider: {
    icon: Sparkles,
    title: "AI Provider",
    subtitle: "Bring your own LLM key and configure providers",
  },
  netsuite: {
    icon: Cloud,
    title: "NetSuite",
    subtitle: "Connect MCP tools to your NetSuite account.",
    docsLinks: [
      {
        label: "Setup guide",
        href: "/docs/netsuite-integration",
      },
      {
        label: "AI Connector",
        href: ORACLE_DOC_LINKS.aiConnector,
      },
    ],
  },
  search: {
    icon: Globe,
    title: "Web Search",
    subtitle:
      "Enable Oracle NetSuite Help Center search tools available in chat.",
  },
  timezone: {
    icon: Clock,
    title: "Timezone",
    subtitle: "Set your timezone for accurate date and time calculations.",
  },
  account: {
    icon: User,
    title: "Account",
    subtitle: "Your account details and session information.",
  },
};

async function fetchSettings() {
  try {
    // Add cache busting to ensure fresh data
    const response = await fetch("/api/settings", {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
      },
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[Settings] Failed to fetch settings:",
        response.status,
        errorText,
      );
      throw new Error(`Failed to fetch settings: ${response.status}`);
    }
    const data = await response.json();
    console.log("[Settings] Received from API:", {
      hasGoogleKey: !!data.googleApiKey,
      hasAnthropicKey: !!data.anthropicApiKey,
      hasOpenAIKey: !!data.openaiApiKey,
      aiProvider: data.aiProvider,
      googleKeyLength: data.googleApiKey?.length ?? 0,
      anthropicKeyLength: data.anthropicApiKey?.length ?? 0,
      openaiKeyLength: data.openaiApiKey?.length ?? 0,
    });
    return data as {
      googleApiKey: string | null;
      anthropicApiKey: string | null;
      openaiApiKey: string | null;
      aiProvider: "google" | "anthropic" | "openai";
      netsuiteAccountId: string | null;
      netsuiteClientId: string | null;
      netsuiteAccounts: NetSuiteAccountEntry[];
      timezone: string;
      searchDomainIds: string[];
      maxIterations: string;
      aiProviders?: AiProviderConfig;
    };
  } catch (error) {
    console.error("[Settings] Error in fetchSettings:", error);
    throw error;
  }
}

type NetSuiteStatusResponse = {
  connected: boolean;
  connectedAccountIds?: string[];
  activeAccountId?: string | null;
};

async function fetchNetSuiteStatus() {
  const response = await fetch("/api/netsuite/status");
  if (!response.ok) {
    return { connected: false, connectedAccountIds: [] as string[] };
  }
  return response.json() as Promise<NetSuiteStatusResponse>;
}

type SettingsPanelProps = {
  active: boolean;
  section: SettingsPanelSection;
};

// Get timezone display name and abbreviation
function getTimezoneDisplay(tz: string): {
  code: string;
  name: string;
  full: string;
} {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    });
    const parts = formatter.formatToParts(now);
    const tzNamePart = parts.find((part) => part.type === "timeZoneName");
    const code = tzNamePart?.value || "";

    const longFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "long",
    });
    const longParts = longFormatter.formatToParts(now);
    const tzLongPart = longParts.find((part) => part.type === "timeZoneName");
    const name = tzLongPart?.value || tz;

    return {
      code,
      name,
      full: tz,
    };
  } catch {
    return {
      code: "",
      name: tz,
      full: tz,
    };
  }
}

// Get all available timezones
function getAllTimezones(): string[] {
  try {
    // Use Intl API if available (modern browsers)
    if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
      return Intl.supportedValuesOf("timeZone").sort();
    }
  } catch {
    // Fallback if not supported
  }

  // Fallback list of common timezones
  return [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Phoenix",
    "America/Anchorage",
    "America/Honolulu",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Rome",
    "Europe/Madrid",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Asia/Hong_Kong",
    "Asia/Singapore",
    "Asia/Dubai",
    "Australia/Sydney",
    "Australia/Melbourne",
    "Pacific/Auckland",
  ].sort();
}

export function SettingsPanel({ active, section }: SettingsPanelProps) {
  const { closePortal } = useAppPortal();
  const { data: session } = useSession();
  const router = useRouter();
  const isGuest = guestRegex.test(session?.user?.email ?? "");

  // Fetch user info including lastLoginAt
  const { data: userInfo } = useSWR(
    session?.user?.id ? "/api/user/info" : null,
    async () => {
      const response = await fetch("/api/user/info");
      if (!response.ok) {
        throw new Error("Failed to fetch user info");
      }
      return response.json() as Promise<{
        id: string;
        email: string;
        lastLoginAt: string | null;
      }>;
    },
  );
  const timezoneId = useId();
  const [settingsCacheKey, setSettingsCacheKey] = useState<string | null>(null);
  const { mutate: globalMutate } = useSWRConfig();

  // Create new cache key when panel becomes active to force fresh fetch
  useEffect(() => {
    if (active) {
      setSettingsCacheKey(`settings-${Date.now()}`);
    } else {
      setSettingsCacheKey(null);
    }
  }, [active]);

  // Fetch settings only when panel is active
  const {
    data: settings,
    mutate: refreshSettings,
    isLoading,
  } = useSWR(settingsCacheKey, fetchSettings, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupeInterval: 0, // Always fetch fresh data, don't dedupe
    revalidateIfStale: true, // Revalidate if data is stale
  });
  const { data: netsuiteStatus, mutate: refreshNetsuiteStatus } = useSWR(
    active ? "netsuite-status" : null,
    fetchNetSuiteStatus,
  );

  const [netsuiteAccounts, setNetsuiteAccounts] = useState<
    NetSuiteAccountEntry[]
  >([]);
  const [netsuiteAccountId, setNetsuiteAccountId] = useState("");
  const [newAccountId, setNewAccountId] = useState("");
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [isSaving, setIsSaving] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState("");
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [searchDomainIds, setSearchDomainIds] = useState<string[]>([]);
  const [aiProviders, setAiProviders] = useState<AiProviderConfig>(() =>
    ensureSeededProviderConfig(null),
  );
  const [isConnectingNetSuite, setIsConnectingNetSuite] = useState(false);
  const [dcrProbe, setDcrProbe] = useState<NetSuiteDcrProbeState>({
    status: "idle",
  });
  const [editingLabels, setEditingLabels] = useState<Record<string, string>>(
    {},
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const initializedForThisOpenRef = useRef(false);
  const dcrProbeRequestIdRef = useRef(0);
  const timezones = getAllTimezones();

  // Filter timezones based on search
  const filteredTimezones = timezones.filter((tz) => {
    if (!timezoneSearch.trim()) {
      return true;
    }
    const searchLower = timezoneSearch.toLowerCase();
    const display = getTimezoneDisplay(tz);
    const searchText =
      `${display.code} ${display.name} ${display.full}`.toLowerCase();
    return searchText.includes(searchLower);
  });

  // Reset initialization flag when panel becomes active
  useEffect(() => {
    if (active) {
      initializedForThisOpenRef.current = false;
      void refreshSettings();
    } else {
      initializedForThisOpenRef.current = false;
    }
  }, [active, refreshSettings]);

  // Populate form when settings load and panel is active
  useEffect(() => {
    if (!active) {
      return;
    }

    if (isLoading) {
      return;
    }

    if (!settings) {
      console.warn("[Settings] Panel active but settings not loaded yet");
      return;
    }

    // Only populate once per active session
    if (initializedForThisOpenRef.current) {
      return;
    }

    // Populate form when settings are available
    if (typeof settings === "object" && "aiProvider" in settings) {
      const provider =
        settings.aiProvider === "google" ||
        settings.aiProvider === "anthropic" ||
        settings.aiProvider === "openai"
          ? settings.aiProvider
          : "google";
      const accounts = settings.netsuiteAccounts ?? [];
      const activeId =
        settings.netsuiteAccountId ?? accounts[0]?.accountId ?? "";
      setNetsuiteAccounts(accounts);
      setNetsuiteAccountId(activeId);
      setEditingLabels(
        Object.fromEntries(
          accounts.map((account) => [account.accountId, account.label]),
        ),
      );
      setTimezone(settings.timezone ?? "UTC");
      setSearchDomainIds(settings.searchDomainIds ?? []);
      setAiProviders(
        ensureSeededProviderConfig(
          parseAiProviderConfig(
            "aiProviders" in settings ? settings.aiProviders : null,
          ),
          {
            googleApiKey: settings.googleApiKey,
            anthropicApiKey: settings.anthropicApiKey,
            openaiApiKey: settings.openaiApiKey,
            aiProvider: provider,
            maxIterations: settings.maxIterations,
          },
        ),
      );
      initializedForThisOpenRef.current = true;
    } else {
      console.warn("[Settings] Settings object invalid:", settings);
    }
  }, [settings, active, isLoading]);

  // Keep NetSuite picker in sync if settings arrive/revalidate with an
  // active account while local state is still empty (skeleton remount race).
  useEffect(() => {
    if (!active || !settings) {
      return;
    }
    const accounts = settings.netsuiteAccounts ?? [];
    const activeId = settings.netsuiteAccountId ?? accounts[0]?.accountId ?? "";
    if (!activeId && accounts.length === 0) {
      return;
    }
    if (netsuiteAccounts.length === 0 && accounts.length > 0) {
      setNetsuiteAccounts(accounts);
      setEditingLabels(
        Object.fromEntries(
          accounts.map((account) => [account.accountId, account.label]),
        ),
      );
    }
    if (!netsuiteAccountId && activeId) {
      setNetsuiteAccountId(activeId);
    }
  }, [active, settings, netsuiteAccountId, netsuiteAccounts.length]);

  const accountOptions =
    netsuiteAccounts.length > 0
      ? netsuiteAccounts
      : (settings?.netsuiteAccounts ?? []);
  const selectedAccountId = (() => {
    if (
      netsuiteAccountId &&
      accountOptions.some((account) => account.accountId === netsuiteAccountId)
    ) {
      return netsuiteAccountId;
    }
    const fromSettings = settings?.netsuiteAccountId ?? "";
    if (
      fromSettings &&
      accountOptions.some((account) => account.accountId === fromSettings)
    ) {
      return fromSettings;
    }
    return accountOptions[0]?.accountId ?? "";
  })();

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (timezoneOpen && searchInputRef.current) {
      // Small delay to ensure the dropdown content is rendered
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [timezoneOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Include all selected domains (both included and premium tiers)
      const effectiveSearchDomainIds = Array.from(new Set(searchDomainIds));

      const accountsToSave =
        netsuiteAccounts.length > 0
          ? netsuiteAccounts
          : (settings?.netsuiteAccounts ?? []);
      const activeToSave =
        netsuiteAccountId?.trim() ||
        selectedAccountId ||
        settings?.netsuiteAccountId ||
        null;

      const payload: Record<string, unknown> = {
        netsuiteAccountId: activeToSave,
        netsuiteAccounts: accountsToSave,
        timezone: timezone?.trim() || "UTC",
        searchDomainIds: effectiveSearchDomainIds,
        aiProviders,
      };

      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save settings");
      }

      toast({
        type: "success",
        description: "Settings saved successfully",
      });

      // Refresh settings after save
      const freshData = await fetchSettings();
      await refreshSettings(freshData, { revalidate: false });

      // Invalidate the "settings" cache key used by model selector components
      // This ensures they refresh with the new provider
      await globalMutate("settings");

      // Always close portal after saving
      closePortal();
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to save settings",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const probeNetSuiteDcr = async (accountId: string) => {
    const normalized = normalizeNetSuiteAccountId(accountId);
    if (!normalized) {
      setDcrProbe({ status: "idle" });
      return;
    }

    const requestId = ++dcrProbeRequestIdRef.current;
    setDcrProbe({ status: "probing" });

    const selected = netsuiteAccounts.find(
      (account) => account.accountId === normalized,
    );

    try {
      const response = await fetch("/api/netsuite/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: normalized,
          label: selected?.label || normalized,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (requestId !== dcrProbeRequestIdRef.current) {
        return;
      }

      if (!response.ok) {
        setDcrProbe({
          status: "error",
          error: data.error || "Failed to check NetSuite integration",
        });
        return;
      }

      if (data.status === "ready") {
        setDcrProbe({ status: "ready", clientId: data.clientId });
        setNetsuiteAccounts((previous) => {
          const base =
            previous.length > 0
              ? previous
              : (settings?.netsuiteAccounts ?? [
                  {
                    accountId: normalized,
                    label: selected?.label || normalized,
                    clientId: null,
                  },
                ]);
          const exists = base.some(
            (account) => account.accountId === normalized,
          );
          const next = exists
            ? base.map((account) =>
                account.accountId === normalized
                  ? { ...account, clientId: data.clientId }
                  : account,
              )
            : [
                ...base,
                {
                  accountId: normalized,
                  label: selected?.label || normalized,
                  clientId: data.clientId,
                },
              ];
          return next;
        });
        await refreshSettings();
        return;
      }

      if (data.status === "needs_integration") {
        setDcrProbe({
          status: "needs_integration",
          accountId: data.accountId,
          integrationUrl: data.integrationUrl,
          redirectUri: data.redirectUri,
          dcrClientName: data.dcrClientName,
          checklist: data.checklist ?? [],
        });
        await refreshSettings();
        return;
      }

      setDcrProbe({
        status: "error",
        error: data.error || "Unexpected probe response",
      });
    } catch (error) {
      if (requestId !== dcrProbeRequestIdRef.current) {
        return;
      }
      setDcrProbe({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Failed to check NetSuite integration",
      });
    }
  };

  // Probe whenever the active account changes while Settings is active.
  // biome-ignore lint/correctness/useExhaustiveDependencies: account selection drives probe; probeNetSuiteDcr is recreated each render
  useEffect(() => {
    if (!active || isGuest || !selectedAccountId) {
      // Invalidate in-flight probes so a late response can't show a miss card
      // when nothing is selected.
      dcrProbeRequestIdRef.current += 1;
      setDcrProbe({ status: "idle" });
      return;
    }

    if (netsuiteAccountId !== selectedAccountId) {
      setNetsuiteAccountId(selectedAccountId);
    }

    void probeNetSuiteDcr(selectedAccountId);
  }, [active, isGuest, selectedAccountId]);

  const persistAccounts = async (
    accounts: NetSuiteAccountEntry[],
    activeId: string,
  ) => {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        netsuiteAccounts: accounts,
        netsuiteAccountId: activeId || null,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Failed to save NetSuite accounts");
    }
  };

  const handleAddNetSuiteAccount = async () => {
    const accountId = normalizeNetSuiteAccountId(newAccountId);
    if (!accountId) {
      return;
    }

    const label = newAccountLabel.trim() || accountId;
    const nextAccounts = [
      ...netsuiteAccounts.filter((account) => account.accountId !== accountId),
      {
        accountId,
        label,
        clientId:
          netsuiteAccounts.find((account) => account.accountId === accountId)
            ?.clientId ?? null,
      },
    ].sort((a, b) => a.label.localeCompare(b.label));

    try {
      await persistAccounts(nextAccounts, accountId);
      setNetsuiteAccounts(nextAccounts);
      setNetsuiteAccountId(accountId);
      setEditingLabels((previous) => ({ ...previous, [accountId]: label }));
      setNewAccountId("");
      setNewAccountLabel("");
      await refreshSettings();
      toast({ type: "success", description: `Added ${label}` });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to add account",
      });
    }
  };

  const handleRemoveNetSuiteAccount = async (accountId: string) => {
    const normalized = normalizeNetSuiteAccountId(accountId);
    const nextAccounts = netsuiteAccounts.filter(
      (account) => account.accountId !== normalized,
    );
    const nextActive =
      netsuiteAccountId === normalized
        ? (nextAccounts[0]?.accountId ?? "")
        : netsuiteAccountId;

    try {
      await persistAccounts(nextAccounts, nextActive);
      setNetsuiteAccounts(nextAccounts);
      setNetsuiteAccountId(nextActive);
      setEditingLabels((previous) => {
        const next = { ...previous };
        delete next[normalized];
        return next;
      });
      await refreshSettings();
      await refreshNetsuiteStatus();
      toast({ type: "success", description: "Account removed" });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to remove account",
      });
    }
  };

  const handleRenameNetSuiteAccount = async (accountId: string) => {
    const normalized = normalizeNetSuiteAccountId(accountId);
    const label =
      editingLabels[normalized]?.trim() ||
      netsuiteAccounts.find((account) => account.accountId === normalized)
        ?.label ||
      normalized;
    const nextAccounts = netsuiteAccounts.map((account) =>
      account.accountId === normalized ? { ...account, label } : account,
    );

    try {
      await persistAccounts(nextAccounts, netsuiteAccountId);
      setNetsuiteAccounts(nextAccounts);
      await refreshSettings();
      toast({ type: "success", description: "Account renamed" });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to rename account",
      });
    }
  };

  const handleSelectNetSuiteAccount = async (accountId: string) => {
    setNetsuiteAccountId(accountId);
    try {
      await persistAccounts(netsuiteAccounts, accountId);
      await refreshSettings();
      await refreshNetsuiteStatus();
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to switch NetSuite account",
      });
    }
  };

  const handleNetSuiteDisconnect = async (accountId: string) => {
    const normalized = normalizeNetSuiteAccountId(accountId);
    try {
      const response = await fetch("/api/netsuite/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: normalized }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to disconnect");
      }
      toast({
        type: "success",
        description: "NetSuite account disconnected successfully",
      });
      await refreshNetsuiteStatus();
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to disconnect NetSuite account",
      });
    }
  };

  const handleNetSuiteConnect = async () => {
    if (!netsuiteAccountId || dcrProbe.status !== "ready") {
      return;
    }

    if (isNetSuiteAccountConnected(selectedAccountId, netsuiteStatus)) {
      return;
    }

    const selected = netsuiteAccounts.find(
      (account) => account.accountId === netsuiteAccountId,
    );

    setIsConnectingNetSuite(true);
    try {
      const response = await fetch("/api/netsuite/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: netsuiteAccountId,
          label: selected?.label || netsuiteAccountId,
          clientId: dcrProbe.clientId,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to prepare NetSuite connection");
      }

      if (data.status === "needs_integration") {
        setDcrProbe({
          status: "needs_integration",
          accountId: data.accountId,
          integrationUrl: data.integrationUrl,
          redirectUri: data.redirectUri,
          dcrClientName: data.dcrClientName,
          checklist: data.checklist ?? [],
        });
        await refreshSettings();
        return;
      }

      await refreshSettings();
      window.location.href = data.authorizeUrl || "/api/netsuite/authorize";
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to connect NetSuite account",
      });
    } finally {
      setIsConnectingNetSuite(false);
    }
  };

  const openIntegrationSetup = () => {
    const url =
      dcrProbe.status === "needs_integration"
        ? dcrProbe.integrationUrl
        : netsuiteAccountId
          ? getNetSuiteNewIntegrationUrl(netsuiteAccountId)
          : null;
    if (!url) {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDomainToggle = (domainId: string, checked: boolean) => {
    setSearchDomainIds((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(domainId);
      } else {
        next.delete(domainId);
      }
      return Array.from(next);
    });
  };

  const connectedAccountIds = (
    netsuiteStatus?.connectedAccountIds ??
    (netsuiteStatus?.connected && selectedAccountId ? [selectedAccountId] : [])
  ).map((id) => normalizeNetSuiteAccountId(id));
  const isSelectedAccountConnected = isNetSuiteAccountConnected(
    selectedAccountId,
    {
      connected: netsuiteStatus?.connected,
      connectedAccountIds,
    },
  );
  const canConnectNetSuite =
    Boolean(selectedAccountId) &&
    !isConnectingNetSuite &&
    !isSelectedAccountConnected &&
    dcrProbe.status === "ready";

  // Show skeletons while loading
  const showSkeletons = isLoading;
  const sectionMeta = SECTION_META[section];
  const defaultProviderType = aiProviders.providers.find(
    (entry) => entry.id === aiProviders.defaultId,
  )?.type;
  const headerDocsLinks =
    section === "provider"
      ? [PROVIDER_DOCS[defaultProviderType ?? "google"]]
      : sectionMeta.docsLinks;

  const handlePersistProviders = async (config: AiProviderConfig) => {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiProviders: config }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Failed to save AI providers");
    }
    await refreshSettings();
    await globalMutate("settings");
  };

  return (
    <form
      autoComplete="off"
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <PortalPanelHeader
        docsLinks={headerDocsLinks}
        icon={sectionMeta.icon}
        subtitle={sectionMeta.subtitle}
        title={sectionMeta.title}
      />

      <div className="min-h-0 flex-1 overflow-y-scroll py-4 pl-4 pr-4 [scrollbar-gutter:stable] sm:pl-5 sm:pr-5">
        {section === "provider" ? (
          <AiProviderSettings
            aiProviders={aiProviders}
            onAiProvidersChange={setAiProviders}
            onPersistProviders={handlePersistProviders}
            showSkeletons={showSkeletons || !settings}
          />
        ) : null}

        {section === "netsuite" ? (
          isGuest ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="mb-4 text-center text-muted-foreground text-sm">
                Login to use NetSuite features
              </p>
              <Button
                onClick={() => {
                  router.push("/login");
                  closePortal();
                }}
                type="button"
              >
                Login
              </Button>
            </div>
          ) : (
            <NetSuiteConnectPanel
              accounts={accountOptions}
              canConnect={canConnectNetSuite}
              dcrProbe={dcrProbe}
              editingLabels={editingLabels}
              connectedAccountIds={connectedAccountIds}
              isConnected={isSelectedAccountConnected}
              isConnecting={isConnectingNetSuite}
              newAccountId={newAccountId}
              newAccountLabel={newAccountLabel}
              onAddAccount={() => {
                void handleAddNetSuiteAccount();
              }}
              onConnect={() => {
                void handleNetSuiteConnect();
              }}
              onDisconnect={(accountId) => {
                void handleNetSuiteDisconnect(accountId);
              }}
              onEditingLabelChange={(accountId, value) => {
                setEditingLabels((previous) => ({
                  ...previous,
                  [accountId]: value,
                }));
              }}
              onNewAccountIdChange={setNewAccountId}
              onNewAccountLabelChange={setNewAccountLabel}
              onOpenIntegration={openIntegrationSetup}
              onProbe={(accountId) => {
                void probeNetSuiteDcr(accountId);
              }}
              onRemoveAccount={(accountId) => {
                void handleRemoveNetSuiteAccount(accountId);
              }}
              onRenameAccount={(accountId) => {
                void handleRenameNetSuiteAccount(accountId);
              }}
              onSelectAccount={(accountId) => {
                void handleSelectNetSuiteAccount(accountId);
              }}
              selectedAccountId={selectedAccountId}
              settingsActive={active && section === "netsuite"}
              showSkeletons={showSkeletons}
            />
          )
        ) : null}

        {section === "search" ? (
          isGuest ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="mb-4 text-center text-muted-foreground text-sm">
                Login to configure web search tools
              </p>
              <Button
                onClick={() => {
                  router.push("/login");
                  closePortal();
                }}
                type="button"
              >
                Login
              </Button>
            </div>
          ) : showSkeletons ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton className="h-14 w-full" key={i} />
              ))}
            </div>
          ) : (
            <div>
              {searchDomains.map((domain) => {
                const checked = searchDomainIds.includes(domain.id);
                return (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-border/60 border-b py-3 last:border-b-0"
                    key={domain.id}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{domain.label}</p>
                      <p className="text-muted-foreground text-xs">
                        {domain.description}
                      </p>
                      <p className="mt-0.5 truncate text-muted-foreground text-xs">
                        {getSearchDomainUrl(domain)}
                      </p>
                    </div>
                    <Switch
                      checked={checked}
                      onCheckedChange={(isChecked) =>
                        handleDomainToggle(domain.id, isChecked)
                      }
                    />
                  </div>
                );
              })}
            </div>
          )
        ) : null}

        {section === "timezone" ? (
          <div className="space-y-2">
            {showSkeletons ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <DropdownMenu
                onOpenChange={(isOpen) => {
                  setTimezoneOpen(isOpen);
                  if (!isOpen) {
                    setTimezoneSearch("");
                  }
                }}
                open={timezoneOpen}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    className="w-full justify-between"
                    id={timezoneId}
                    type="button"
                    variant="outline"
                  >
                    {timezone
                      ? (() => {
                          const display = getTimezoneDisplay(timezone);
                          return display.code
                            ? `[${display.code}] ${display.name} ${display.full}`
                            : `${display.name} ${display.full}`;
                        })()
                      : "Select timezone"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="flex max-h-[min(300px,var(--radix-dropdown-menu-content-available-height))] w-(--radix-dropdown-menu-trigger-width) flex-col overflow-hidden p-0"
                >
                  <div className="shrink-0 border-b p-2">
                    <Input
                      className="h-8"
                      onChange={(e) => setTimezoneSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape" && timezoneSearch) {
                          setTimezoneSearch("");
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                      placeholder="Search timezones..."
                      ref={searchInputRef}
                      value={timezoneSearch}
                    />
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-1">
                    {filteredTimezones.length > 0 ? (
                      filteredTimezones.map((tz) => {
                        const display = getTimezoneDisplay(tz);
                        const displayText = display.code
                          ? `[${display.code}] ${display.name} ${display.full}`
                          : `${display.name} ${display.full}`;
                        return (
                          <DropdownMenuItem
                            key={tz}
                            onSelect={() => {
                              setTimezone(tz);
                              setTimezoneOpen(false);
                              setTimezoneSearch("");
                            }}
                          >
                            {displayText}
                          </DropdownMenuItem>
                        );
                      })
                    ) : (
                      <div className="py-6 text-center text-muted-foreground text-sm">
                        No timezones found
                      </div>
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ) : null}

        {section === "account" && session?.user?.id ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="font-medium text-muted-foreground text-xs">
                User ID
              </p>
              <p className="font-mono text-sm">{session.user.id}</p>
            </div>
            <div className="space-y-1.5">
              <p className="font-medium text-muted-foreground text-xs">Email</p>
              <p className="text-sm">
                {userInfo?.email || session.user.email || "N/A"}
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="font-medium text-muted-foreground text-xs">
                Last Login
              </p>
              <p className="text-sm">
                {userInfo?.lastLoginAt
                  ? new Date(userInfo.lastLoginAt).toLocaleString()
                  : "Never"}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <DialogFooter className="shrink-0 gap-2 border-t border-border/60 py-3 pl-4 pr-8 sm:justify-end sm:pl-5 sm:pr-9">
        {section === "netsuite" ? (
          <Button onClick={() => closePortal()} type="button">
            Close
          </Button>
        ) : (
          <>
            <Button
              onClick={() => closePortal()}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isSaving || isLoading}
              onClick={() => handleSave()}
              type="button"
            >
              {isSaving ? (
                <>
                  <span className="mr-2 inline-block animate-spin">
                    <LoaderIcon size={16} />
                  </span>
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </>
        )}
      </DialogFooter>
    </form>
  );
}
