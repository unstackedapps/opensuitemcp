"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { AuthForm } from "@/components/auth-form";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";
import { type LoginActionState, login } from "../actions";

export function LoginForm({
  showSignUpLink = true,
}: {
  showSignUpLink?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [actionState, formAction] = useActionState<LoginActionState, FormData>(
    login,
    {
      status: "idle",
    },
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
      {showSignUpLink ? (
        <p className="mt-4 text-center text-gray-600 text-sm dark:text-zinc-400">
          {"Don't have an account? "}
          <Link
            className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
            href="/register"
          >
            Sign up
          </Link>
          {" for free."}
        </p>
      ) : null}
    </AuthForm>
  );
}
