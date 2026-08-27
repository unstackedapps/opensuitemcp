"use client";

import { ExternalLink } from "lucide-react";
import { LoaderIcon, WarningIcon } from "@/components/icons";
import {
  INFO_NOTICE_BODY_CLASS,
  INFO_NOTICE_CARD_CLASS,
  INFO_NOTICE_ICON_CLASS,
  INFO_NOTICE_TITLE_CLASS,
} from "@/components/info-notice-styles";
import { Button } from "@/components/ui/button";
import { NETSUITE_INTEGRATION_DOCS_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type NetSuiteDcrProbeState =
  | { status: "idle" }
  | { status: "probing" }
  | { status: "ready"; clientId: string }
  | {
      status: "needs_integration";
      accountId: string;
      integrationUrl: string;
      redirectUri: string;
      dcrClientName: string;
      checklist: string[];
    }
  | { status: "error"; error: string };

const setupCardClass = INFO_NOTICE_CARD_CLASS;
const setupIconClass = INFO_NOTICE_ICON_CLASS;
const setupTitleClass = INFO_NOTICE_TITLE_CLASS;
const setupBodyClass = INFO_NOTICE_BODY_CLASS;

type NetSuiteIntegrationSetupCardProps = {
  accountDisplay: string;
  accountId: string;
  dcrProbe: NetSuiteDcrProbeState;
  onProbe: (accountId: string) => void;
  onOpenIntegration: () => void;
  onCancel?: (accountId: string) => void;
  controlClassName?: string;
};

function IntegrationDocsLink({ className }: { className?: string }) {
  return (
    <a
      className={cn(
        "inline-flex items-center gap-1 underline-offset-4 hover:underline",
        className,
      )}
      href={NETSUITE_INTEGRATION_DOCS_URL}
      rel="noopener noreferrer"
      target="_blank"
    >
      NetSuite integration guide
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

export function NetSuiteIntegrationSetupCard({
  accountDisplay,
  accountId,
  dcrProbe,
  onProbe,
  onOpenIntegration,
  onCancel,
  controlClassName,
}: NetSuiteIntegrationSetupCardProps) {
  const buttonClass = cn("h-8 px-2.5 text-xs", controlClassName);

  if (dcrProbe.status === "probing") {
    return (
      <p className="flex items-center gap-2 text-muted-foreground text-xs">
        <span className="inline-block animate-spin">
          <LoaderIcon size={14} />
        </span>
        Checking Integration record…
      </p>
    );
  }

  if (dcrProbe.status === "error") {
    return (
      <div className={setupCardClass}>
        <div className="flex items-start gap-2">
          <div className={cn("mt-0.5 shrink-0", setupIconClass)}>
            <WarningIcon size={14} />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className={setupTitleClass}>Could not verify Integration</p>
            <p className={setupBodyClass}>{dcrProbe.error}</p>
            <IntegrationDocsLink className={setupBodyClass} />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className={buttonClass}
                onClick={() => onProbe(accountId)}
                size="sm"
                type="button"
                variant="outline"
              >
                Check again
              </Button>
              {onCancel ? (
                <Button
                  className={buttonClass}
                  disabled={!accountId}
                  onClick={() => onCancel(accountId)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (dcrProbe.status !== "needs_integration") {
    return null;
  }

  return (
    <div className={setupCardClass}>
      <div className="flex items-start gap-2">
        <div className={cn("mt-0.5 shrink-0", setupIconClass)}>
          <WarningIcon size={14} />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-2">
            <p className={setupTitleClass}>Create the Integration record</p>
            <p className={setupBodyClass}>
              Account <span className="font-medium">{accountDisplay}</span>. A
              NetSuite administrator creates this once per account, then you can
              connect.
            </p>
            <IntegrationDocsLink className={setupBodyClass} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className={buttonClass}
              onClick={onOpenIntegration}
              size="sm"
              type="button"
              variant="outline"
            >
              Open New Integration
            </Button>
            <Button
              className={buttonClass}
              disabled={!accountId}
              onClick={() => onProbe(accountId)}
              size="sm"
              type="button"
              variant="outline"
            >
              Check again
            </Button>
            {onCancel ? (
              <Button
                className={buttonClass}
                disabled={!accountId}
                onClick={() => onCancel(accountId)}
                size="sm"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
