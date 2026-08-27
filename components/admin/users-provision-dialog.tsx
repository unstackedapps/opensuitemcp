"use client";

import { Download, Upload } from "lucide-react";
import { useId, useState } from "react";
import { adminProvisionUsers } from "@/app/admin/users/actions";
import { ADMIN_CONTROL_CLASS } from "@/components/admin/admin-shell";
import { UserProvisionCatalogControls } from "@/components/admin/user-provision-catalog";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  parseUserProvisionCsv,
  userProvisionCsvTemplate,
  userProvisionRowsToCsv,
} from "@/lib/org/admin/user-csv";
import type { OrgUserRow } from "@/lib/org/admin/users";
import { cn } from "@/lib/utils";

type UsersProvisionDialogProps = {
  exportUsers: OrgUserRow[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  open: boolean;
};

export function UsersProvisionDialog({
  exportUsers,
  onOpenChange,
  onSaved,
  open,
}: UsersProvisionDialogProps) {
  const fileId = useId();
  const pasteId = useId();
  const [csvText, setCsvText] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [previewCount, setPreviewCount] = useState(0);
  const [applying, setApplying] = useState(false);

  const downloadCsv = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleParse = (text: string) => {
    setCsvText(text);
    const parsed = parseUserProvisionCsv(text);
    setParseErrors(parsed.errors);
    setPreviewCount(parsed.rows.length);
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    handleParse(text);
  };

  const handleExport = () => {
    const csv = userProvisionRowsToCsv(
      exportUsers.map((row) => ({
        email: row.email,
        name: row.name,
        role: row.role,
        status: row.status,
      })),
    );
    downloadCsv(csv, "users-export.csv");
  };

  const handleExportTemplate = () => {
    downloadCsv(userProvisionCsvTemplate(), "users-import-template.csv");
  };

  const handleApply = async () => {
    const parsed = parseUserProvisionCsv(csvText);
    if (parsed.errors.length > 0) {
      setParseErrors(parsed.errors);
      toast({
        type: "error",
        description: "Fix CSV errors before applying.",
      });
      return;
    }
    if (parsed.rows.length === 0) {
      toast({ type: "error", description: "No rows to apply." });
      return;
    }

    setApplying(true);
    const result = await adminProvisionUsers({ rows: parsed.rows });
    setApplying(false);

    if (!result.ok) {
      toast({
        type: "error",
        description: result.error ?? "Provisioning failed.",
      });
      return;
    }

    const parts = [
      result.created > 0 ? `${result.created} created` : null,
      result.updated > 0 ? `${result.updated} updated` : null,
      result.deleted > 0 ? `${result.deleted} deleted` : null,
    ].filter(Boolean);

    toast({
      type: "success",
      description: parts.length > 0 ? parts.join(", ") : "No changes.",
    });

    if (result.errors.length > 0) {
      toast({
        type: "error",
        description: `${result.errors.length} row error(s). Check details below.`,
      });
      setParseErrors(result.errors);
    } else {
      setCsvText("");
      setParseErrors([]);
      setPreviewCount(0);
      onSaved();
    }
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          setCsvText("");
          setParseErrors([]);
          setPreviewCount(0);
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className="flex max-h-[calc(100dvh-5.5rem)] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <DialogTitle className="text-base">Import / export users</DialogTitle>
          <p className="text-muted-foreground text-xs">
            CSV columns: email, name, role, disabled, action.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <UserProvisionCatalogControls />

          <div className="flex flex-wrap gap-2">
            <Button
              className={ADMIN_CONTROL_CLASS}
              onClick={handleExportTemplate}
              type="button"
              variant="outline"
            >
              <Download className="mr-1 size-3.5" />
              CSV template
            </Button>
            <Button
              className={ADMIN_CONTROL_CLASS}
              onClick={handleExport}
              type="button"
              variant="outline"
            >
              <Download className="mr-1 size-3.5" />
              Export {exportUsers.length} users
            </Button>
            <Label
              className={cn(
                ADMIN_CONTROL_CLASS,
                "inline-flex cursor-pointer items-center rounded-md border border-input bg-background px-3 hover:bg-accent",
              )}
              htmlFor={fileId}
            >
              <Upload className="mr-1 size-3.5" />
              Upload CSV
            </Label>
            <input
              accept=".csv,text/csv"
              className="hidden"
              id={fileId}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleFile(file);
                }
                event.target.value = "";
              }}
              type="file"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs" htmlFor={pasteId}>
              Paste or edit CSV
            </Label>
            <Textarea
              className="min-h-[140px] resize-y font-mono text-xs md:min-h-[140px]"
              id={pasteId}
              onChange={(event) => handleParse(event.target.value)}
              placeholder="email,name,role,disabled,action&#10;user@example.com,Jane,member,false,upsert"
              value={csvText}
            />
          </div>

          {previewCount > 0 ? (
            <p className="text-muted-foreground text-xs">
              {previewCount} row{previewCount === 1 ? "" : "s"} ready to apply.
            </p>
          ) : null}

          {parseErrors.length > 0 ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="font-medium text-destructive text-xs">
                {parseErrors.length} issue
                {parseErrors.length === 1 ? "" : "s"}
              </p>
              <ul className="mt-1 space-y-0.5 text-destructive text-xs">
                {parseErrors.slice(0, 12).map((error) => (
                  <li key={error}>{error}</li>
                ))}
                {parseErrors.length > 12 ? (
                  <li>…and {parseErrors.length - 12} more</li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t px-4 py-3">
          <Button
            className={ADMIN_CONTROL_CLASS}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className={ADMIN_CONTROL_CLASS}
            disabled={applying || previewCount === 0}
            onClick={() => void handleApply()}
            type="button"
          >
            Apply import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
