"use client";

import { Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  adminDeleteReportToken,
  adminGenerateReportToken,
} from "@/app/admin/instance-report/actions";
import { ConfirmDestructiveDialog } from "@/components/confirm-destructive-dialog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingRow } from "@/components/ui/setting-row";

type TokenState =
  | { source: "none" }
  | { source: "env" }
  | { source: "app"; createdAt: string; createdByEmail: string | null };

async function copy(value: string, what: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast({ type: "success", description: `${what} copied.` });
  } catch {
    toast({ type: "error", description: `Could not copy the ${what}.` });
  }
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input className="font-mono text-xs" readOnly value={value} />
        <Button
          className="size-9 shrink-0 p-0"
          onClick={() => copy(value, label)}
          type="button"
          variant="outline"
        >
          <Copy className="size-3.5" />
          <span className="sr-only">Copy the {label}</span>
        </Button>
      </div>
    </div>
  );
}

/**
 * The instance report for whoever operates this install: the address to give
 * them, and the token they read it with. Generating a token turns the report
 * on with no restart.
 */
export function InstanceReportPanel({ token }: { token: TokenState }) {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"replace" | "off" | null>(null);
  const [busy, setBusy] = useState(false);

  // The address the admin reached this page on is the one the operator uses.
  // The operator's admin adds the report's path itself.
  useEffect(() => {
    setAddress(window.location.origin);
  }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const result = await adminGenerateReportToken();
      if (!result.ok) {
        toast({ type: "error", description: result.error });
        return;
      }
      setIssued(result.token);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    const result = await adminDeleteReportToken();
    if (!result.ok) {
      toast({ type: "error", description: result.error });
      return;
    }
    router.refresh();
  };

  let description: string;
  let control: React.ReactNode = null;
  if (token.source === "env") {
    description = "Set by OSMCP_INSTANCE_REPORT_TOKEN on the server.";
  } else if (token.source === "app") {
    const when = new Date(token.createdAt).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    description = token.createdByEmail
      ? `Generated ${when} by ${token.createdByEmail}.`
      : `Generated ${when}.`;
    control = (
      <div className="flex gap-2">
        <Button
          disabled={busy}
          onClick={() => setConfirm("replace")}
          size="sm"
          variant="outline"
        >
          Replace
        </Button>
        <Button
          disabled={busy}
          onClick={() => setConfirm("off")}
          size="sm"
          variant="outline"
        >
          Turn off
        </Button>
      </div>
    );
  } else {
    description = "Off.";
    control = (
      <Button disabled={busy} onClick={generate} size="sm">
        Generate token
      </Button>
    );
  }

  return (
    <div className="divide-y divide-border/60">
      <SettingRow
        control={
          <Button
            onClick={() => copy(address, "Address")}
            size="sm"
            variant="outline"
          >
            <Copy className="size-3.5" />
            Copy
          </Button>
        }
        description={<span className="font-mono">{address}</span>}
        title="Address"
      />
      <SettingRow
        control={control}
        description={description}
        title="Report token"
      />

      <Dialog
        onOpenChange={(open) => !open && setIssued(null)}
        open={issued !== null}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send these to your operator</DialogTitle>
            <DialogDescription>The token isn't shown again.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <CopyField label="Address" value={address} />
            <CopyField label="Token" value={issued ?? ""} />
          </div>
          <DialogFooter>
            <Button onClick={() => setIssued(null)} type="button">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDestructiveDialog
        confirmLabel={confirm === "replace" ? "Replace" : "Turn off"}
        description={
          confirm === "replace"
            ? "Your operator's current token stops working. Send them the new one."
            : "Your operator's token stops working, and so do updates from your operator."
        }
        onConfirm={confirm === "replace" ? generate : turnOff}
        onOpenChange={(open) => !open && setConfirm(null)}
        open={confirm !== null}
        title={
          confirm === "replace"
            ? "Replace the report token?"
            : "Turn off the instance report?"
        }
        variant={confirm === "replace" ? "default" : "destructive"}
      />
    </div>
  );
}
