"use client";

import Form from "next/form";
import { useId } from "react";

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
    <Form action={action} className="flex flex-col gap-4 px-4 sm:px-16">
      <div className="flex flex-col gap-2">
        <Label
          className="font-normal text-zinc-600 dark:text-zinc-400"
          htmlFor={emailId}
        >
          Email Address
        </Label>

        <Input
          autoComplete="email"
          autoFocus
          className="bg-muted text-md md:text-sm"
          defaultValue={defaultEmail}
          id={emailId}
          name="email"
          placeholder="user@acme.com"
          required
          type="email"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label
          className="font-normal text-zinc-600 dark:text-zinc-400"
          htmlFor={passwordId}
        >
          Password
        </Label>

        <Input
          className="bg-muted text-md md:text-sm"
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
