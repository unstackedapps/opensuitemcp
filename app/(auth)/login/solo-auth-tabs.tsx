"use client";

import Form from "next/form";
import { useSearchParams } from "next/navigation";
import { useActionState, useEffect, useId, useState } from "react";
import {
  type LoginActionState,
  login,
  type RegisterActionState,
  register,
} from "@/app/(auth)/actions";
import { startSoloNetSuiteLogin } from "@/app/(auth)/login/actions";
import {
  AUTH_FIELD_INPUT_CLASS,
  AUTH_FIELD_LABEL_CLASS,
} from "@/components/auth-field-styles";
import { AuthForm } from "@/components/auth-form";
import { AuthOidcFallbackNote } from "@/components/auth-oidc-fallback-note";
import {
  NetSuiteOidcLoginPicker,
  type OidcLoginOption,
} from "@/components/netsuite-oidc-login-picker";
import { NetSuiteOidcSetupGuide } from "@/components/netsuite-oidc-setup-guide";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthOidcFallbackTab } from "@/hooks/use-auth-oidc-fallback-tab";

function SignInPanel() {
  const [email, setEmail] = useState("");

  const [actionState, formAction] = useActionState<LoginActionState, FormData>(
    login,
    { status: "idle" },
  );
  const status = actionState?.status ?? "idle";

  useEffect(() => {
    if (status === "failed") {
      toast({
        type: "error",
        description: "Invalid credentials!",
      });
    } else if (status === "invalid_data") {
      toast({
        type: "error",
        description: "Failed validating your submission!",
      });
    }
  }, [status]);

  const handleSubmit = async (formData: FormData) => {
    setEmail(String(formData.get("email") ?? ""));
    await formAction(formData);
  };

  return (
    <AuthForm action={handleSubmit} defaultEmail={email}>
      <SubmitButton isSuccessful={false}>Sign in</SubmitButton>
    </AuthForm>
  );
}

function CreateAccountPanel() {
  const [email, setEmail] = useState("");

  const [actionState, formAction] = useActionState<
    RegisterActionState,
    FormData
  >(register, { status: "idle" });
  const status = actionState?.status ?? "idle";

  useEffect(() => {
    if (status === "user_exists") {
      toast({ type: "error", description: "Account already exists!" });
    } else if (status === "registration_closed") {
      toast({
        type: "error",
        description:
          "This personal install already has a sign-in method. Sign in instead.",
      });
    } else if (status === "failed") {
      toast({
        type: "error",
        description: "Failed to create account!",
      });
    } else if (status === "invalid_data") {
      toast({
        type: "error",
        description: "Failed validating your submission!",
      });
    }
  }, [status]);

  const handleSubmit = async (formData: FormData) => {
    setEmail(String(formData.get("email") ?? ""));
    await formAction(formData);
  };

  return (
    <AuthForm action={handleSubmit} defaultEmail={email}>
      <SubmitButton isSuccessful={false}>Create account</SubmitButton>
    </AuthForm>
  );
}

function SoloNetSuiteSetupForm() {
  const accountIdFieldId = useId();
  const clientIdFieldId = useId();

  return (
    <Form action={startSoloNetSuiteLogin} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Label className={AUTH_FIELD_LABEL_CLASS} htmlFor={accountIdFieldId}>
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
        <Label className={AUTH_FIELD_LABEL_CLASS} htmlFor={clientIdFieldId}>
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

      <SubmitButton isSuccessful={false}>Create account</SubmitButton>
    </Form>
  );
}

function NetSuiteSection({
  oidcOptions,
  allowOidcSetup,
  isInitialSetup = false,
}: {
  oidcOptions: OidcLoginOption[];
  allowOidcSetup: boolean;
  isInitialSetup?: boolean;
}) {
  if (oidcOptions.length > 0) {
    return (
      <NetSuiteOidcLoginPicker
        actionLabel={isInitialSetup ? "Create account" : undefined}
        intent="login"
        options={oidcOptions}
        returnTo="/"
      />
    );
  }

  if (!allowOidcSetup) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-center text-muted-foreground text-xs">
        NetSuite sign-in is not configured yet.
      </p>
    );
  }

  return <SoloNetSuiteSetupForm />;
}

function EmailPanel({
  allowPublicRegister,
  isInitialSetup,
}: {
  allowPublicRegister: boolean;
  isInitialSetup: boolean;
}) {
  const searchParams = useSearchParams();
  const [emailMode, setEmailMode] = useState<"sign-in" | "create">(() => {
    if (isInitialSetup) {
      return "create";
    }
    if (allowPublicRegister && searchParams.get("account") === "create") {
      return "create";
    }
    return "sign-in";
  });

  if (isInitialSetup) {
    return <CreateAccountPanel />;
  }

  if (emailMode === "create" && allowPublicRegister) {
    return (
      <div className="flex flex-col gap-3">
        <CreateAccountPanel />
        <p className="text-center text-muted-foreground text-xs">
          Already have an account?{" "}
          <button
            className="font-medium text-foreground underline-offset-4 hover:underline"
            onClick={() => setEmailMode("sign-in")}
            type="button"
          >
            Sign in
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SignInPanel />
      {allowPublicRegister ? (
        <p className="text-center text-muted-foreground text-xs">
          Don&apos;t have an account?{" "}
          <button
            className="font-medium text-foreground underline-offset-4 hover:underline"
            onClick={() => setEmailMode("create")}
            type="button"
          >
            Create one
          </button>
        </p>
      ) : null}
    </div>
  );
}

export function SoloAuthTabs({
  oidcOptions,
  allowPublicRegister,
  isInitialSetup = allowPublicRegister,
}: {
  oidcOptions: OidcLoginOption[];
  allowPublicRegister: boolean;
  isInitialSetup?: boolean;
}) {
  const hasOidc = oidcOptions.length > 0;
  const showNetSuite = hasOidc || allowPublicRegister;
  const { tab, setTab, showFallbackNote, fallbackNote } =
    useAuthOidcFallbackTab("email");

  if (!showNetSuite) {
    return <SignInPanel />;
  }

  return (
    <Tabs className="w-full" onValueChange={setTab} value={tab}>
      <TabsList className="grid h-8 w-full grid-cols-2 p-0.5">
        <TabsTrigger className="h-7 text-[11px] sm:text-sm" value="netsuite">
          Sign-in with NetSuite
        </TabsTrigger>
        <TabsTrigger className="h-7 text-[11px] sm:text-sm" value="email">
          Basic Auth
        </TabsTrigger>
      </TabsList>

      <TabsContent className="mt-4 space-y-4" value="netsuite">
        <NetSuiteSection
          allowOidcSetup={allowPublicRegister}
          isInitialSetup={isInitialSetup}
          oidcOptions={oidcOptions}
        />
      </TabsContent>

      <TabsContent className="mt-4 space-y-4" value="email">
        {showFallbackNote ? (
          <AuthOidcFallbackNote message={fallbackNote} />
        ) : null}
        <EmailPanel
          allowPublicRegister={allowPublicRegister}
          isInitialSetup={isInitialSetup}
        />
      </TabsContent>
    </Tabs>
  );
}
