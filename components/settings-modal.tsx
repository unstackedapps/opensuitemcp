"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  ClockIcon,
  CloudIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  LoaderIcon,
  UserIcon,
  WarningIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
// Tabs removed - consolidated into single pane
import { getSearchDomainUrl, searchDomains } from "@/lib/ai/search-domains";
import { guestRegex } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "./toast";

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
      timezone: string;
      searchDomainIds: string[];
    };
  } catch (error) {
    console.error("[Settings] Error in fetchSettings:", error);
    throw error;
  }
}

async function fetchNetSuiteStatus() {
  const response = await fetch("/api/netsuite/status");
  if (!response.ok) {
    return { connected: false };
  }
  return response.json() as Promise<{ connected: boolean }>;
}

type SettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
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
  const googleApiKeyId = useId();
  const anthropicApiKeyId = useId();
  const openaiApiKeyId = useId();
  const netsuiteAccountIdInputId = useId();
  const netsuiteClientIdInputId = useId();
  const timezoneId = useId();
  const [settingsCacheKey, setSettingsCacheKey] = useState<string | null>(null);
  const { mutate: globalMutate } = useSWRConfig();

  // Create new cache key when modal opens to force fresh fetch
  useEffect(() => {
    if (open) {
      setSettingsCacheKey(`settings-${Date.now()}`);
    } else {
      setSettingsCacheKey(null);
    }
  }, [open]);

  // Fetch settings only when modal is open
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
    open ? "netsuite-status" : null,
    fetchNetSuiteStatus,
  );

  const [googleApiKey, setGoogleApiKey] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [aiProvider, setAiProvider] = useState<
    "google" | "anthropic" | "openai"
  >("google");
  const [showGoogleApiKey, setShowGoogleApiKey] = useState(false);
  const [showAnthropicApiKey, setShowAnthropicApiKey] = useState(false);
  const [showOpenaiApiKey, setShowOpenaiApiKey] = useState(false);
  const [netsuiteAccountId, setNetsuiteAccountId] = useState("");
  const [showAccountId, setShowAccountId] = useState(false);
  const [netsuiteClientId, setNetsuiteClientId] = useState("");
  const [showClientId, setShowClientId] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const [isSaving, setIsSaving] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState("");
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [searchDomainIds, setSearchDomainIds] = useState<string[]>([]);
  const [isConnectingNetSuite, setIsConnectingNetSuite] = useState(false);
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

  // Tabs removed - no longer needed

  // Reset initialization flag and force fresh fetch when modal opens
  useEffect(() => {
    if (open) {
      initializedForThisOpenRef.current = false;
      // Force a fresh fetch when modal opens to avoid stale cache
      void refreshSettings(undefined, { revalidate: true });
    } else {
      initializedForThisOpenRef.current = false;
    }
  }, [open, refreshSettings]);

  // Populate form when settings load and modal is open
  useEffect(() => {
    if (!open) {
      return;
    }

    if (isLoading) {
      return;
    }

    if (!settings) {
      console.warn("[Settings] Modal open but settings not loaded yet");
      return;
    }

    // Only populate once per modal open session
    if (initializedForThisOpenRef.current) {
      return;
    }

    // Populate form when settings are available
    if (typeof settings === "object" && "aiProvider" in settings) {
      setGoogleApiKey(settings.googleApiKey ?? "");
      setAnthropicApiKey(settings.anthropicApiKey ?? "");
      setOpenaiApiKey(settings.openaiApiKey ?? "");
      // Ensure aiProvider is set correctly - it should always be one of the valid values
      const provider =
        settings.aiProvider === "google" ||
        settings.aiProvider === "anthropic" ||
        settings.aiProvider === "openai"
          ? settings.aiProvider
          : "google";
      setAiProvider(provider);
      setNetsuiteAccountId(settings.netsuiteAccountId ?? "");
      setNetsuiteClientId(settings.netsuiteClientId ?? "");
      setTimezone(settings.timezone ?? "UTC");
      setSearchDomainIds(settings.searchDomainIds ?? []);
      initializedForThisOpenRef.current = true;
    } else {
      console.warn("[Settings] Settings object invalid:", settings);
    }
  }, [settings, open, isLoading]);

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

      const payload = {
        googleApiKey: googleApiKey?.trim() || null,
        anthropicApiKey: anthropicApiKey?.trim() || null,
        openaiApiKey: openaiApiKey?.trim() || null,
        aiProvider: aiProvider,
        netsuiteAccountId: netsuiteAccountId?.trim() || null,
        netsuiteClientId: netsuiteClientId?.trim() || null,
        timezone: timezone?.trim() || "UTC",
        searchDomainIds: effectiveSearchDomainIds,
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

      // Always close modal after saving
      onOpenChange(false);
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

  const handleNetSuiteConnect = async () => {
    if (netsuiteStatus?.connected) {
      // Disconnect
      try {
        const response = await fetch("/api/netsuite/disconnect", {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error("Failed to disconnect");
        }
        toast({
          type: "success",
          description: "NetSuite account disconnected successfully",
        });
        refreshNetsuiteStatus();
      } catch {
        toast({
          type: "error",
          description: "Failed to disconnect NetSuite account",
        });
      }
      return;
    }

    // Connect: persist current NetSuite credentials, then start OAuth flow
    if (!netsuiteAccountId || !netsuiteClientId) {
      return;
    }

    setIsConnectingNetSuite(true);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          netsuiteAccountId: netsuiteAccountId.trim(),
          netsuiteClientId: netsuiteClientId.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to save NetSuite settings");
      }

      // Ensure settings cache reflects the latest values
      refreshSettings();

      window.location.href = "/api/netsuite/authorize";
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

  const isNetSuiteConnected = netsuiteStatus?.connected ?? false;

  // Show skeletons while loading
  const showSkeletons = isLoading;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full! flex flex-col focus:outline-none focus:ring-0 focus:ring-offset-0 sm:max-w-[800px]!"
        onOpenAutoFocus={(e) => {
          // Prevent auto-focus on first input when modal opens
          e.preventDefault();
        }}
      >
        <SheetHeader className="text-left shrink-0">
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Manage your API keys, NetSuite configuration, and preferences
          </SheetDescription>
        </SheetHeader>

        <form
          autoComplete="off"
          className="flex flex-col flex-1 min-h-0"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <div className="mt-6 space-y-6 flex-1 overflow-y-auto">
            {/* AI Provider Selection and API Keys */}
            <Card className="bg-background shadow-none">
              <CardHeader className="py-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex",
                        "items-center",
                        "justify-center",
                        "rounded-md",
                        "bg-muted",
                        "text-primary",
                        "size-10",
                        "mt-0.5",
                      )}
                    >
                      <CloudIcon size={20} />
                    </div>
                    <div>
                      <CardTitle className="text-base">AI Provider</CardTitle>
                      <p className="text-muted-foreground text-sm">
                        Choose which AI provider to use for chat responses
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-4">
                  {/* Provider Selector */}
                  <div className="space-y-2">
                    {showSkeletons || !settings ? (
                      <>
                        <div className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 flex items-center">
                          <Skeleton className="h-4 w-full" />
                        </div>
                        <Skeleton className="h-4 w-3/4" />
                      </>
                    ) : (
                      <>
                        <Select
                          key={`provider-${aiProvider}`} // Force re-render when aiProvider changes
                          value={aiProvider}
                          onValueChange={(
                            value: "google" | "anthropic" | "openai",
                          ) => {
                            setAiProvider(value);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select provider" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="google">
                              Google (Gemini)
                            </SelectItem>
                            <SelectItem value="anthropic">
                              Anthropic (Claude)
                            </SelectItem>
                            <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-muted-foreground text-xs">
                          {aiProvider === "google"
                            ? "Using Gemini models (2.5 Flash for speed, 2.5 Pro for reasoning)"
                            : aiProvider === "anthropic"
                              ? "Using Claude models (4.5 Haiku for speed, Sonnet 4 for reasoning)"
                              : "Using OpenAI models (GPT-5 Mini for speed, O4 Mini for reasoning)"}
                        </p>
                      </>
                    )}
                  </div>

                  {/* OpenAI Organization Verification Notice */}
                  {aiProvider === "openai" && (
                    <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-500">
                          <WarningIcon size={16} />
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                            Organization Verification Required
                          </p>
                          <p className="text-xs text-yellow-800 dark:text-yellow-200">
                            For enhanced reasoning features, you need to verify
                            your organization at{" "}
                            <a
                              className="text-primary underline hover:no-underline"
                              href="https://platform.openai.com/settings/organization/general"
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              platform.openai.com/settings/organization/general
                            </a>
                            . If you just verified, it can take up to 15 minutes
                            for access to propagate.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Google API Key Input - Only shown when Google is selected */}
                  {aiProvider === "google" && (
                    <div className="space-y-2">
                      <Label htmlFor={googleApiKeyId}>Google API Key</Label>
                      <p className="text-muted-foreground text-xs">
                        To get a Google AI API key, visit{" "}
                        <a
                          className="text-primary underline hover:no-underline"
                          href="https://aistudio.google.com/apikey"
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          aistudio.google.com/apikey
                        </a>
                        .
                      </p>
                      {showSkeletons ? (
                        <div className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 flex items-center">
                          <Skeleton className="h-4 w-full" />
                        </div>
                      ) : (
                        <div className="relative">
                          <Input
                            autoComplete="off"
                            className="pr-10"
                            data-1p-ignore="true"
                            data-form-type="other"
                            data-lpignore="true"
                            id={googleApiKeyId}
                            name="google-api-key"
                            onChange={(e) => setGoogleApiKey(e.target.value)}
                            placeholder="Enter your Google API key"
                            type={showGoogleApiKey ? "text" : "password"}
                            value={googleApiKey}
                          />
                          <Button
                            className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                            onClick={() =>
                              setShowGoogleApiKey(!showGoogleApiKey)
                            }
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            {showGoogleApiKey ? (
                              <EyeOffIcon size={16} />
                            ) : (
                              <EyeIcon size={16} />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Anthropic API Key Input - Only shown when Anthropic is selected */}
                  {aiProvider === "anthropic" && (
                    <div className="space-y-2">
                      <Label htmlFor={anthropicApiKeyId}>
                        Anthropic API Key
                      </Label>
                      <p className="text-muted-foreground text-xs">
                        To get an Anthropic API key, visit{" "}
                        <a
                          className="text-primary underline hover:no-underline"
                          href="https://console.anthropic.com/"
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          console.anthropic.com
                        </a>
                        .
                      </p>
                      {showSkeletons ? (
                        <div className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 flex items-center">
                          <Skeleton className="h-4 w-full" />
                        </div>
                      ) : (
                        <div className="relative">
                          <Input
                            autoComplete="off"
                            className="pr-10"
                            data-1p-ignore="true"
                            data-form-type="other"
                            data-lpignore="true"
                            id={anthropicApiKeyId}
                            name="anthropic-api-key"
                            onChange={(e) => setAnthropicApiKey(e.target.value)}
                            placeholder="Enter your Anthropic API key"
                            type={showAnthropicApiKey ? "text" : "password"}
                            value={anthropicApiKey}
                          />
                          <Button
                            className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                            onClick={() =>
                              setShowAnthropicApiKey(!showAnthropicApiKey)
                            }
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            {showAnthropicApiKey ? (
                              <EyeOffIcon size={16} />
                            ) : (
                              <EyeIcon size={16} />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* OpenAI API Key Input - Only shown when OpenAI is selected */}
                  {aiProvider === "openai" && (
                    <div className="space-y-2">
                      <Label htmlFor={openaiApiKeyId}>OpenAI API Key</Label>
                      <p className="text-muted-foreground text-xs">
                        To get an OpenAI API key, visit{" "}
                        <a
                          className="text-primary underline hover:no-underline"
                          href="https://platform.openai.com/api-keys"
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          platform.openai.com/api-keys
                        </a>
                        .
                      </p>
                      {showSkeletons ? (
                        <div className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 flex items-center">
                          <Skeleton className="h-4 w-full" />
                        </div>
                      ) : (
                        <div className="relative">
                          <Input
                            autoComplete="off"
                            className="pr-10"
                            data-1p-ignore="true"
                            data-form-type="other"
                            data-lpignore="true"
                            id={openaiApiKeyId}
                            name="openai-api-key"
                            onChange={(e) => setOpenaiApiKey(e.target.value)}
                            placeholder="Enter your OpenAI API key"
                            type={showOpenaiApiKey ? "text" : "password"}
                            value={openaiApiKey}
                          />
                          <Button
                            className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                            onClick={() =>
                              setShowOpenaiApiKey(!showOpenaiApiKey)
                            }
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            {showOpenaiApiKey ? (
                              <EyeOffIcon size={16} />
                            ) : (
                              <EyeIcon size={16} />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* NetSuite Section */}
            {isGuest ? (
              <Card className="bg-background shadow-none">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <p className="mb-4 text-center text-muted-foreground text-sm">
                    Login to use NetSuite features
                  </p>
                  <Button
                    onClick={() => {
                      router.push("/login");
                      onOpenChange(false);
                    }}
                    type="button"
                  >
                    Login
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* MCP Connection Section */}
                <Card className="bg-background shadow-none">
                  <CardHeader className="py-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "flex",
                            "items-center",
                            "justify-center",
                            "rounded-md",
                            "bg-muted",
                            "text-primary",
                            "size-10",
                            "mt-0.5",
                          )}
                        >
                          <CloudIcon size={20} />
                        </div>
                        <div>
                          <CardTitle className="text-base">
                            MCP Connection
                          </CardTitle>
                          <p className="text-muted-foreground text-sm">
                            Connect your NetSuite account to enable data access
                            via MCP tools.
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0">
                    <div className="space-y-2">
                      <Label htmlFor={netsuiteAccountIdInputId}>
                        Account ID
                      </Label>
                      {showSkeletons ? (
                        <div className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 flex items-center">
                          <Skeleton className="h-4 w-full" />
                        </div>
                      ) : (
                        <div className="relative">
                          <Input
                            autoComplete="off"
                            className="pr-10"
                            data-1p-ignore="true"
                            data-form-type="other"
                            data-lpignore="true"
                            id={netsuiteAccountIdInputId}
                            name="netsuite-account-id"
                            onChange={(e) =>
                              setNetsuiteAccountId(e.target.value)
                            }
                            placeholder="Enter your NetSuite Account ID"
                            type={showAccountId ? "text" : "password"}
                            value={netsuiteAccountId}
                          />
                          <Button
                            className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowAccountId(!showAccountId)}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            {showAccountId ? (
                              <EyeOffIcon size={16} />
                            ) : (
                              <EyeIcon size={16} />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={netsuiteClientIdInputId}>Client ID</Label>
                      {showSkeletons ? (
                        <div className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 flex items-center">
                          <Skeleton className="h-4 w-full" />
                        </div>
                      ) : (
                        <div className="relative">
                          <Input
                            autoComplete="off"
                            className="pr-10"
                            data-1p-ignore="true"
                            data-form-type="other"
                            data-lpignore="true"
                            id={netsuiteClientIdInputId}
                            name="netsuite-client-id"
                            onChange={(e) =>
                              setNetsuiteClientId(e.target.value)
                            }
                            placeholder="Enter your NetSuite Client ID"
                            type={showClientId ? "text" : "password"}
                            value={netsuiteClientId}
                          />
                          <Button
                            className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowClientId(!showClientId)}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            {showClientId ? (
                              <EyeOffIcon size={16} />
                            ) : (
                              <EyeIcon size={16} />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Button
                          disabled={
                            !netsuiteAccountId ||
                            !netsuiteClientId ||
                            isConnectingNetSuite
                          }
                          onClick={handleNetSuiteConnect}
                          type="button"
                          variant={
                            isNetSuiteConnected ? "destructive" : "default"
                          }
                        >
                          {isNetSuiteConnected
                            ? "Disconnect"
                            : isConnectingNetSuite
                              ? "Connecting..."
                              : "Connect"}
                        </Button>
                        {isNetSuiteConnected && (
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-green-600 dark:bg-green-400" />
                            <span className="text-muted-foreground text-sm">
                              Connected
                            </span>
                          </div>
                        )}
                      </div>
                      {(!netsuiteAccountId || !netsuiteClientId) && (
                        <p className="text-muted-foreground text-xs">
                          Please enter Account ID and Client ID before
                          connecting
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Web Resources Section */}
                <Card className="bg-background shadow-none">
                  <CardHeader className="py-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "flex",
                            "items-center",
                            "justify-center",
                            "rounded-md",
                            "bg-muted",
                            "text-primary",
                            "size-10",
                            "mt-0.5",
                          )}
                        >
                          <GlobeIcon size={20} />
                        </div>
                        <div>
                          <CardTitle className="text-base">
                            Web Resources
                          </CardTitle>
                          <p className="text-muted-foreground text-sm">
                            Expand Ava&apos;s browsing to trusted NetSuite blogs
                            and resources.
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-0">
                    {showSkeletons ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map((i) => (
                          <Skeleton key={i} className="h-20 w-full" />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {searchDomains.map((domain) => {
                          // Check if domain is explicitly in the selected list
                          const checked = searchDomainIds.includes(domain.id);
                          return (
                            <div
                              className={cn(
                                "border",
                                "flex",
                                "gap-3",
                                "items-start",
                                "p-3",
                                "rounded-lg",
                                "transition-colors",
                                "hover:bg-muted/50",
                              )}
                              key={domain.id}
                            >
                              <Switch
                                checked={checked}
                                className="mt-1"
                                onCheckedChange={(isChecked) =>
                                  handleDomainToggle(domain.id, isChecked)
                                }
                              />
                              <div className="flex-1">
                                <p className="font-medium text-sm">
                                  {domain.label}
                                </p>
                                <p className="text-muted-foreground text-xs">
                                  {domain.description}
                                </p>
                                <p className="mt-1 text-muted-foreground text-xs">
                                  {getSearchDomainUrl(domain)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {/* Timezone Section */}
            <Card className="bg-background shadow-none">
              <CardHeader className="py-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex",
                        "items-center",
                        "justify-center",
                        "rounded-md",
                        "bg-muted",
                        "text-primary",
                        "size-10",
                        "mt-0.5",
                      )}
                    >
                      <ClockIcon size={20} />
                    </div>
                    <div>
                      <CardTitle className="text-base">Timezone</CardTitle>
                      <p className="text-muted-foreground text-sm">
                        Set your timezone for accurate date and time
                        calculations.
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
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
                        className="max-h-[300px] w-(--radix-dropdown-menu-trigger-width)"
                      >
                        <div className="border-b p-2">
                          <Input
                            className="h-8"
                            onChange={(e) => setTimezoneSearch(e.target.value)}
                            onKeyDown={(e) => {
                              // Prevent closing on Escape if there's search text
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
                        <div className="max-h-[250px] overflow-y-auto">
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
              </CardContent>
            </Card>

            {/* User Information Section */}
            {session?.user?.id && (
              <Card className="bg-background shadow-none">
                <CardHeader className="py-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex",
                          "items-center",
                          "justify-center",
                          "rounded-md",
                          "bg-muted",
                          "text-primary",
                          "size-10",
                          "mt-0.5",
                        )}
                      >
                        <UserIcon size={20} />
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          User Information
                        </CardTitle>
                        <p className="text-muted-foreground text-sm">
                          Your account details and session information
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <p className="text-muted-foreground text-xs font-medium">
                        User ID
                      </p>
                      <p className="font-mono text-sm">{session.user.id}</p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-muted-foreground text-xs font-medium">
                        Email
                      </p>
                      <p className="text-sm">
                        {userInfo?.email || session.user.email || "N/A"}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-muted-foreground text-xs font-medium">
                        Last Login
                      </p>
                      <p className="text-sm">
                        {userInfo?.lastLoginAt
                          ? new Date(userInfo.lastLoginAt).toLocaleString()
                          : "Never"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-8 shrink-0">
            <Button
              onClick={() => onOpenChange(false)}
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
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
