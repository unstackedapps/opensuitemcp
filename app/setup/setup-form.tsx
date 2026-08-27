"use client";

import Form from "next/form";
import { useActionState, useEffect, useId, useState } from "react";
import {
  AUTH_FIELD_INPUT_CLASS,
  AUTH_FIELD_LABEL_CLASS,
} from "@/components/auth-field-styles";
import { AuthOidcFallbackNote } from "@/components/auth-oidc-fallback-note";
import { NetSuiteOidcSetupGuide } from "@/components/netsuite-oidc-setup-guide";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthOidcFallbackTab } from "@/hooks/use-auth-oidc-fallback-tab";
import {
  type BootstrapActionState,
  bootstrapOrgOwner,
  startNetSuiteBootstrap,
  startNetSuiteBootstrapFromEnv,
} from "./actions";

type SetupFormProps = {
  envOidcAccountId: string | null;
};

export function SetupForm({ envOidcAccountId }: SetupFormProps) {
  const accountIdFieldId = useId();
  const clientIdFieldId = useId();
  const orgNameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState("");

  const [state, formAction] = useActionState<BootstrapActionState, FormData>(
    bootstrapOrgOwner,
    { status: "idle" },
  );
  const { tab, setTab, showFallbackNote, fallbackNote } =
    useAuthOidcFallbackTab("password");

  useEffect(() => {
    if (state.status === "user_exists") {
      toast({
        type: "error",
        description: "That email is already registered. Sign in instead.",
      });
    } else if (state.status === "already_configured") {
      window.location.href = "/";
    } else if (state.status === "bootstrap_not_configured") {
      toast({
        type: "error",
        description: "Set OSMCP_ROOT_EMAIL before completing setup.",
      });
    } else if (state.status === "root_email_mismatch") {
      toast({
        type: "error",
        description:
          "That email does not match OSMCP_ROOT_EMAIL for org owner bootstrap.",
      });
    } else if (state.status === "failed") {
      toast({ type: "error", description: "Setup failed. Try again." });
    } else if (state.status === "invalid_data") {
      toast({
        type: "error",
        description: "Check your entries and try again.",
      });
    }
  }, [state.status]);

  return (
    <Tabs className="w-full" onValueChange={setTab} value={tab}>
      <TabsList className="grid h-8 w-full grid-cols-2 p-0.5">
        <TabsTrigger className="h-7 text-[11px] sm:text-sm" value="netsuite">
          Sign-in with NetSuite
        </TabsTrigger>
        <TabsTrigger className="h-7 text-[11px] sm:text-sm" value="password">
          Basic Auth
        </TabsTrigger>
      </TabsList>

      <TabsContent className="mt-4 space-y-4" value="netsuite">
        {envOidcAccountId ? (
          <Form
            action={startNetSuiteBootstrapFromEnv}
            className="flex flex-col gap-3"
          >
            <p className="text-muted-foreground text-xs">
              NetSuite account{" "}
              <code className="text-[11px]">{envOidcAccountId}</code> and OIDC
              client ID were set during install.
            </p>
            <SubmitButton isSuccessful={false}>
              Create organization
            </SubmitButton>
          </Form>
        ) : (
          <Form action={startNetSuiteBootstrap} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <Label
                  className={AUTH_FIELD_LABEL_CLASS}
                  htmlFor={accountIdFieldId}
                >
                  NetSuite account ID
                </Label>
                <NetSuiteOidcSetupGuide />
              </div>
              <Input
                autoComplete="off"
                className={AUTH_FIELD_INPUT_CLASS}
                id={accountIdFieldId}
                name="accountId"
                placeholder="1234567"
                required
                type="text"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label
                className={AUTH_FIELD_LABEL_CLASS}
                htmlFor={clientIdFieldId}
              >
                OIDC client ID
              </Label>
              <Input
                autoComplete="off"
                className={AUTH_FIELD_INPUT_CLASS}
                id={clientIdFieldId}
                name="clientId"
                placeholder="From your NetSuite OIDC integration"
                required
                type="password"
              />
            </div>

            <SubmitButton isSuccessful={false}>
              Create organization
            </SubmitButton>
          </Form>
        )}
      </TabsContent>

      <TabsContent className="mt-4 space-y-4" value="password">
        {showFallbackNote ? (
          <AuthOidcFallbackNote message={fallbackNote} />
        ) : null}
        <p className="text-muted-foreground text-xs">
          Create the org owner with an email and password. Admin email must
          match <code className="text-[11px]">OSMCP_ROOT_EMAIL</code> set during
          install.
        </p>
        <Form
          action={(formData) => {
            setEmail(formData.get("email") as string);
            formAction(formData);
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-2">
            <Label className={AUTH_FIELD_LABEL_CLASS} htmlFor={orgNameId}>
              Organization name
            </Label>
            <Input
              autoComplete="organization"
              className={AUTH_FIELD_INPUT_CLASS}
              id={orgNameId}
              name="orgName"
              placeholder="Acme NetSuite team"
              type="text"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className={AUTH_FIELD_LABEL_CLASS} htmlFor={emailId}>
              Admin email
            </Label>
            <Input
              autoComplete="email"
              className={AUTH_FIELD_INPUT_CLASS}
              defaultValue={email}
              id={emailId}
              name="email"
              placeholder="admin@yourcompany.com"
              required
              type="email"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className={AUTH_FIELD_LABEL_CLASS} htmlFor={passwordId}>
              Password
            </Label>
            <Input
              className={AUTH_FIELD_INPUT_CLASS}
              id={passwordId}
              minLength={6}
              name="password"
              required
              type="password"
            />
          </div>

          <SubmitButton isSuccessful={false}>Create organization</SubmitButton>
        </Form>
      </TabsContent>
    </Tabs>
  );
}
