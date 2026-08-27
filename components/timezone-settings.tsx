"use client";

import { useEffect, useId, useRef, useState } from "react";
import { OnboardingPanelSkeleton } from "@/components/onboarding/onboarding-panel-skeleton";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

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

function getAllTimezones(): string[] {
  try {
    if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
      return Intl.supportedValuesOf("timeZone").sort();
    }
  } catch {
    // Fallback if not supported
  }

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

type TimezoneSettingsProps = {
  timezone: string;
  disabled?: boolean;
  showSkeletons?: boolean;
  onPersist: (timezone: string) => Promise<void>;
};

export function TimezoneSettings({
  timezone,
  disabled = false,
  showSkeletons = false,
  onPersist,
}: TimezoneSettingsProps) {
  const timezoneId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const timezones = getAllTimezones();

  const filteredTimezones = timezones.filter((tz) => {
    if (!search.trim()) {
      return true;
    }
    const searchLower = search.toLowerCase();
    return (
      tz.toLowerCase().includes(searchLower) ||
      getTimezoneDisplay(tz).name.toLowerCase().includes(searchLower)
    );
  });

  useEffect(() => {
    if (open && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open]);

  if (showSkeletons) {
    return <OnboardingPanelSkeleton rows={1} />;
  }

  return (
    <DropdownMenu
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          setSearch("");
        }
      }}
      open={open}
    >
      <DropdownMenuTrigger asChild>
        <Button
          className="h-8 w-full justify-between text-sm"
          disabled={disabled}
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
            className="h-8 text-sm"
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && search) {
                setSearch("");
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            placeholder="Search timezones..."
            ref={searchInputRef}
            value={search}
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
                    void onPersist(tz).catch((error: unknown) => {
                      toast({
                        type: "error",
                        description:
                          error instanceof Error
                            ? error.message
                            : "Failed to save timezone",
                      });
                    });
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
  );
}
