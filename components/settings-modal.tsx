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
import { AccountExtrasSkeleton } from "@/components/account-extras-skeleton";
import { AccountPasswordForm } from "@/components/account-password-form";
import { AccountSignInMethods } from "@/components/account-sign-in-methods";
import { AiProviderSettings } from "@/components/ai-provider-settings";
import { LoaderIcon } from "@/components/icons";
import { NetSuiteConnectPanel } from "@/components/netsuite-connect-panel";
import { NetSuiteOidcLoginSettings } from "@/components/netsuite-oidc-login-settings";
import { OnboardingPanelSkeleton } from "@/components/onboarding/onboarding-panel-skeleton";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WebSearchSettings } from "@/components/web-search-settings";
import {
  type AiProviderConfig,
  EMPTY_AI_PROVIDER_CONFIG,
  ensureSeededProviderConfig,
  parseAiProviderConfig,
} from "@/lib/ai/provider-entries";
import type { SearchResourceEntry } from "@/lib/ai/search-resources";
import { postSearchResources } from "@/lib/client/persist-search-resources";
import {
  guestRegex,
  NETSUITE_INTEGRATION_DOCS_URL,
  PUBLIC_DOCS_ORIGIN,
} from "@/lib/constants";
import type { NetSuiteAccountEntry } from "@/lib/netsuite/accounts";
import {
  getNetSuiteNewIntegrationUrl,
  isNetSuiteAccountConnected,
  normalizeNetSuiteAccountId,
} from "@/lib/netsuite/accounts";
import { ORACLE_DOC_LINKS } from "@/lib/netsuite/integration-checklist";
import {
  getDcrProbeForAccount,
  useNetSuiteDcrProbes,
} from "@/hooks/use-netsuite-dcr-probes";
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
    <div className="flex shrink-0 items-start justify-between gap-3 border-border/60 border-b px-4 py-2.5 sm:px-5 sm:py-3">
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
    docsLinks: [
      {
        label: "BYOLLM guide",
        href: `${PUBLIC_DOCS_ORIGIN}/docs/byollm`,
      },
    ],
  },
  netsuite: {
    icon: Cloud,
    title: "NetSuite",
    subtitle: "Connect MCP tools to your NetSuite connections.",
    docsLinks: [
      {
        label: "Setup guide",
        href: NETSUITE_INTEGRATION_DOCS_URL,
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
    subtitle: "Add sites the assistant can search in chat.",
  },
  timezone: {
    icon: Clock,
    title: "Timezone",
    subtitle: "Set your timezone for accurate date and time calculations.",
  },
  account: {
    icon: User,
    title: "Account",
    subtitle: "Account details and sign-in.",
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
      searchResources?: SearchResourceEntry[];
      orgSearchPolicy?: { managedByOrg: boolean };
      maxIterations: string;
      aiProviders?: AiProviderConfig;
      orgMcpPolicy?: {
        managedByOrg: boolean;
        allowFreeAdd: boolean;
        lockedAccountIds: string[];
        addableAccounts: NetSuiteAccountEntry[];
      };
      orgLlmPolicy?: {
        managedByOrg: boolean;
      };
      installMode?: "org" | "solo";
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
  const { closePortal, setSection } = useAppPortal();
  const { data: session } = useSession();
  const router = useRouter();
  const isGuest = guestRegex.test(session?.user?.email ?? "");

  // Fetch user info including lastLoginAt
  const {
    data: userInfo,
    mutate: refreshUserInfo,
    isLoading: isUserInfoLoading,
  } = useSWR(session?.user?.id ? "/api/user/info" : null, async () => {
    const response = await fetch("/api/user/info");
    if (!response.ok) {
      throw new Error("Failed to fetch user info");
    }
    return response.json() as Promise<{
      id: string;
      email: string;
      lastLoginAt: string | null;
      hasPassword: boolean;
      mustResetPassword: boolean;
      isSoloInstall: boolean;
      signInMethods: {
        password: boolean;
        oidcConfigured: boolean;
        hasOidcAccess: boolean;
        oidcEmailLinked: boolean;
        oidcLoginEmails: string[];
        oidcLinked: boolean;
      };
    }>;
  });
  const timezoneId = useId();
  const { mutate: globalMutate } = useSWRConfig();

  const {
    data: settings,
    mutate: refreshSettings,
    isLoading,
  } = useSWR(active ? "settings" : null, fetchSettings, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
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
  const [aiProviders, setAiProviders] = useState<AiProviderConfig>(
    () => EMPTY_AI_PROVIDER_CONFIG,
  );
  const [connectingAccountId, setConnectingAccountId] = useState<string | null>(
    null,
  );
  const [editingLabels, setEditingLabels] = useState<Record<string, string>>(
    {},
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const initializedForThisOpenRef = useRef(false);
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

  useEffect(() => {
    if (active && (section === "account" || section === "netsuite")) {
      void refreshUserInfo();
    }
  }, [active, section, refreshUserInfo]);

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

  const { probes, probeAccount, setProbe } = useNetSuiteDcrProbes(
    accountOptions.map((account) => account.accountId),
    {
      enabled: active && !isGuest && section === "netsuite",
      getAccountLabel: (accountId) =>
        accountOptions.find((account) => account.accountId === accountId)
          ?.label,
      onProbeReady: async (accountId, clientId) => {
        setNetsuiteAccounts((previous) => {
          const base =
            previous.length > 0
              ? previous
              : (settings?.netsuiteAccounts ?? [
                  {
                    accountId,
                    label: accountId,
                    clientId: null,
                  },
                ]);
          const exists = base.some((account) => account.accountId === accountId);
          const next = exists
            ? base.map((account) =>
                account.accountId === accountId
                  ? { ...account, clientId }
                  : account,
              )
            : [
                ...base,
                {
                  accountId,
                  label: accountId,
                  clientId,
                },
              ];
          return next;
        });
        await refreshSettings();
      },
    },
  );

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

  const handleAddOrgNetSuiteMcpAccount = async (
    account: NetSuiteAccountEntry,
  ) => {
    const accountId = normalizeNetSuiteAccountId(account.accountId);
    const nextAccounts = [
      ...netsuiteAccounts.filter((entry) => entry.accountId !== accountId),
      {
        accountId,
        label: account.label,
        clientId: account.clientId ?? null,
      },
    ].sort((a, b) => a.label.localeCompare(b.label));

    try {
      await persistAccounts(nextAccounts, accountId);
      setNetsuiteAccounts(nextAccounts);
      setNetsuiteAccountId(accountId);
      setEditingLabels((previous) => ({
        ...previous,
        [accountId]: account.label,
      }));
      await refreshSettings();
      toast({ type: "success", description: `Added ${account.label}` });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to add connection",
      });
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
          error instanceof Error ? error.message : "Failed to add connection",
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
          error instanceof Error
            ? error.message
            : "Failed to remove connection",
      });
    }
  };

  const handleRenameNetSuiteAccount = async (accountId: string) => {
    const normalized = normalizeNetSuiteAccountId(accountId);
    const lockedIds = settings?.orgMcpPolicy?.lockedAccountIds ?? [];
    if (lockedIds.includes(normalized)) {
      toast({
        type: "error",
        description:
          "NetSuite connection nicknames are managed by your organization.",
      });
      return;
    }

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
          error instanceof Error
            ? error.message
            : "Failed to rename connection",
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
            : "Failed to switch NetSuite connection",
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
        description: "NetSuite connection disconnected successfully",
      });
      await refreshNetsuiteStatus();
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to disconnect NetSuite connection",
      });
    }
  };

  const handleNetSuiteConnect = async (accountId: string) => {
    const normalized = normalizeNetSuiteAccountId(accountId);
    const probe = getDcrProbeForAccount(probes, normalized);
    if (!normalized || probe.status !== "ready") {
      return;
    }

    if (isNetSuiteAccountConnected(normalized, netsuiteStatus)) {
      return;
    }

    const selected = netsuiteAccounts.find(
      (account) => account.accountId === normalized,
    );

    setConnectingAccountId(normalized);
    try {
      const response = await fetch("/api/netsuite/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: normalized,
          label: selected?.label || normalized,
          clientId: probe.clientId,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to prepare NetSuite connection");
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
            : "Failed to connect NetSuite connection",
      });
    } finally {
      setConnectingAccountId(null);
    }
  };

  const openIntegrationSetup = (accountId: string) => {
    const normalized = normalizeNetSuiteAccountId(accountId);
    const probe = getDcrProbeForAccount(probes, normalized);
    const url =
      probe.status === "needs_integration"
        ? probe.integrationUrl
        : normalized
          ? getNetSuiteNewIntegrationUrl(normalized)
          : null;
    if (!url) {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handlePersistSearchResources = async (next: SearchResourceEntry[]) => {
    await globalMutate(
      "settings",
      (current) =>
        current && typeof current === "object"
          ? { ...current, searchResources: next }
          : current,
      { revalidate: false },
    );
    try {
      await postSearchResources(next);
      await refreshSettings();
      await globalMutate("settings");
    } catch (error) {
      await globalMutate("settings");
      throw error;
    }
  };

  const handlePersistTimezone = async (next: string) => {
    const value = next.trim() || "UTC";
    const previous = timezone;
    setTimezone(value);
    setTimezoneOpen(false);
    setTimezoneSearch("");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to save timezone");
      }
      await refreshSettings();
      await globalMutate("settings");
      toast({ type: "success", description: "Timezone saved." });
    } catch (error) {
      setTimezone(previous);
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to save timezone",
      });
    }
  };

  const connectedAccountIds = (
    netsuiteStatus?.connectedAccountIds ??
    (netsuiteStatus?.connected && selectedAccountId ? [selectedAccountId] : [])
  ).map((id) => normalizeNetSuiteAccountId(id));

  // Show skeletons while loading
  const showSkeletons = isLoading;
  const sectionMeta = SECTION_META[section];
  const isSoloInstall = settings?.installMode === "solo";
  let panelSubtitle = sectionMeta.subtitle;
  if (section === "netsuite" && isSoloInstall) {
    panelSubtitle =
      "Configure NetSuite sign-in and connect MCP tools for chat.";
  } else if (section === "search" && settings?.orgSearchPolicy?.managedByOrg) {
    panelSubtitle =
      "Your organization provides these resources. You can disable them for your chats.";
  }
  const defaultProviderType = aiProviders.providers.find(
    (entry) => entry.id === aiProviders.defaultId,
  )?.type;
  const headerDocsLinks =
    section === "provider"
      ? [
          ...(sectionMeta.docsLinks ?? []),
          PROVIDER_DOCS[defaultProviderType ?? "google"],
        ]
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

  const mcpConnectPanel = (
    <NetSuiteConnectPanel
      addableOrgAccounts={settings?.orgMcpPolicy?.addableAccounts ?? []}
      allowFreeAccountAdd={
        settings?.orgMcpPolicy?.managedByOrg
          ? false
          : (settings?.orgMcpPolicy?.allowFreeAdd ?? true)
      }
      accounts={accountOptions}
      connectedAccountIds={connectedAccountIds}
      connectingAccountId={connectingAccountId}
      dcrProbesByAccountId={probes}
      editingLabels={editingLabels}
      lockedAccountIds={settings?.orgMcpPolicy?.lockedAccountIds ?? []}
      newAccountId={newAccountId}
      newAccountLabel={newAccountLabel}
      onAddAccount={() => {
        void handleAddNetSuiteAccount();
      }}
      onAddOrgAccount={(account) => {
        void handleAddOrgNetSuiteMcpAccount(account);
      }}
      onConnect={(accountId) => {
        void handleNetSuiteConnect(accountId);
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
      onOpenIntegration={(accountId) => {
        openIntegrationSetup(accountId);
      }}
      onProbe={(accountId) => {
        void probeAccount(accountId);
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
  );

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
        subtitle={panelSubtitle}
        title={sectionMeta.title}
      />

      <div className="min-h-0 flex-1 overflow-y-scroll py-4 pl-4 pr-4 [scrollbar-gutter:stable] sm:pl-5 sm:pr-5">
        {section === "provider" ? (
          <AiProviderSettings
            aiProviders={aiProviders}
            onAiProvidersChange={setAiProviders}
            onPersistProviders={handlePersistProviders}
            orgManaged={settings?.orgLlmPolicy?.managedByOrg ?? false}
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
          ) : isSoloInstall ? (
            <Tabs className="w-full" defaultValue="oidc">
              <TabsList className="grid h-8 w-full grid-cols-2 p-0.5">
                <TabsTrigger className="h-7 text-xs sm:text-sm" value="oidc">
                  Sign in
                </TabsTrigger>
                <TabsTrigger className="h-7 text-xs sm:text-sm" value="mcp">
                  MCP tools
                </TabsTrigger>
              </TabsList>
              <TabsContent className="mt-4" value="oidc">
                <NetSuiteOidcLoginSettings
                  active={active && section === "netsuite"}
                  testReturnTo="/?settings=netsuite&netsuite_connected=true"
                />
              </TabsContent>
              <TabsContent className="mt-4" value="mcp">
                {mcpConnectPanel}
              </TabsContent>
            </Tabs>
          ) : (
            mcpConnectPanel
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
          ) : (
            <WebSearchSettings
              disabled={isSaving || isLoading}
              managedByOrg={settings?.orgSearchPolicy?.managedByOrg ?? false}
              onPersist={handlePersistSearchResources}
              resources={settings?.searchResources ?? []}
              showSkeletons={showSkeletons}
            />
          )
        ) : null}

        {section === "timezone" ? (
          <div className="space-y-2">
            {showSkeletons ? (
              <OnboardingPanelSkeleton rows={1} />
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
                              void handlePersistTimezone(tz);
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
          <div className="space-y-3">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-[11px] text-muted-foreground sm:text-xs">
                  Email
                </p>
                <p className="truncate text-sm">
                  {userInfo?.email || session.user.email || "—"}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="font-medium text-[11px] text-muted-foreground sm:text-xs">
                  Last login
                </p>
                <p className="text-sm">
                  {userInfo?.lastLoginAt
                    ? new Date(userInfo.lastLoginAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "—"}
                </p>
              </div>
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium text-[11px] text-muted-foreground sm:text-xs">
                User ID
              </p>
              <p className="break-all font-mono text-[11px] sm:text-xs">
                {session.user.id}
              </p>
            </div>

            {!isGuest && isUserInfoLoading ? (
              <AccountExtrasSkeleton showPasswordSection />
            ) : null}

            {!isGuest && !isUserInfoLoading && userInfo?.signInMethods ? (
              <AccountSignInMethods
                hasOidcAccess={userInfo.signInMethods.hasOidcAccess}
                hasPassword={userInfo.signInMethods.password}
                isSoloInstall={userInfo.isSoloInstall}
                oidcConfigured={userInfo.signInMethods.oidcConfigured}
                oidcEmailLinked={userInfo.signInMethods.oidcEmailLinked}
                oidcLoginEmails={userInfo.signInMethods.oidcLoginEmails}
                onConfigureOidc={() => setSection("netsuite")}
                onUpdated={() => {
                  void refreshUserInfo();
                }}
              />
            ) : null}

            {!isGuest &&
            !isUserInfoLoading &&
            userInfo &&
            (userInfo.hasPassword || userInfo.isSoloInstall) ? (
              <AccountPasswordForm
                hasPassword={userInfo.hasPassword}
                mustResetPassword={userInfo.mustResetPassword}
                onUpdated={() => {
                  void refreshUserInfo();
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <DialogFooter className="shrink-0 gap-2 border-t border-border/60 px-4 py-3 sm:justify-end sm:px-5">
        {section === "netsuite" ||
        section === "account" ||
        section === "search" ||
        section === "timezone" ? (
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
