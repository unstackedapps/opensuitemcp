"use client";

import Form from "next/form";
import { useId } from "react";

import {
  AUTH_FIELD_INPUT_CLASS,
  AUTH_FIELD_LABEL_CLASS,
} from "@/components/auth-field-styles";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function AuthForm({
  action,
  children,
  defaultEmail = "",
}: {
  action: NonNullable<
    string | ((formData: FormData) => void | Promise<void>) | undefined
  >;
  children: React.ReactNode;
  defaultEmail?: string;
}) {
  const emailId = useId();
  const passwordId = useId();

  return (
    <Form action={action} className="flex w-full flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label className={AUTH_FIELD_LABEL_CLASS} htmlFor={emailId}>
          Email address
        </Label>

        <Input
          autoComplete="email"
          autoFocus
          className={AUTH_FIELD_INPUT_CLASS}
          defaultValue={defaultEmail}
          id={emailId}
          name="email"
          placeholder="user@acme.com"
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
          name="password"
          required
          type="password"
        />
      </div>

      {children}
    </Form>
  );
}
