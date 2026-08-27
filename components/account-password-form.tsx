"use client";

import { useId, useState } from "react";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AccountPasswordFormProps = {
  hasPassword: boolean;
  mustResetPassword: boolean;
  onUpdated: () => void;
};

export function AccountPasswordForm({
  hasPassword,
  mustResetPassword,
  onUpdated,
}: AccountPasswordFormProps) {
  const currentPasswordId = useId();
  const newPasswordId = useId();
  const confirmPasswordId = useId();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const requiresCurrentPassword = hasPassword && !mustResetPassword;
  const inputClass = "h-8 w-full max-w-xs text-sm";

  const handleSubmit = async () => {
    if (newPassword.length < 6) {
      toast({
        type: "error",
        description: "Password must be at least 6 characters.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({ type: "error", description: "New passwords do not match." });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/user/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: requiresCurrentPassword
            ? currentPassword
            : undefined,
          newPassword,
        }),
      });

      const data = (await response.json()) as { error?: string; ok?: boolean };

      if (!response.ok) {
        toast({
          type: "error",
          description: data.error ?? "Could not update password.",
        });
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        type: "success",
        description: hasPassword ? "Password updated." : "Password added.",
      });
      onUpdated();
    } catch {
      toast({ type: "error", description: "Could not update password." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <div className="space-y-0.5">
        <p className="font-medium text-sm">
          {hasPassword ? "Password" : "Add password"}
        </p>
        {mustResetPassword ? (
          <p className="text-[11px] text-amber-600 leading-snug sm:text-xs dark:text-amber-400">
            Set a new password to continue with email sign-in.
          </p>
        ) : null}
        {!hasPassword ? (
          <p className="text-[11px] text-muted-foreground leading-snug sm:text-xs">
            Optional — enables email sign-in alongside NetSuite.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        {requiresCurrentPassword ? (
          <div className="space-y-1">
            <Label
              className="text-[11px] sm:text-xs"
              htmlFor={currentPasswordId}
            >
              Current
            </Label>
            <Input
              autoComplete="current-password"
              className={inputClass}
              id={currentPasswordId}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              type="password"
              value={currentPassword}
            />
          </div>
        ) : null}

        <div className="space-y-1">
          <Label className="text-[11px] sm:text-xs" htmlFor={newPasswordId}>
            New
          </Label>
          <Input
            autoComplete="new-password"
            className={inputClass}
            id={newPasswordId}
            minLength={6}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            type="password"
            value={newPassword}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] sm:text-xs" htmlFor={confirmPasswordId}>
            Confirm
          </Label>
          <Input
            autoComplete="new-password"
            className={inputClass}
            id={confirmPasswordId}
            minLength={6}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            type="password"
            value={confirmPassword}
          />
        </div>
      </div>

      <Button
        className="h-7 w-fit text-[11px] sm:h-8 sm:text-xs"
        disabled={saving}
        onClick={() => void handleSubmit()}
        type="button"
      >
        {saving
          ? "Saving..."
          : hasPassword
            ? "Update password"
            : "Add password"}
      </Button>
    </div>
  );
}
