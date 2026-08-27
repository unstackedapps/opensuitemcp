"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { createUser, getUser } from "@/lib/db/queries";
import { isOrgInstallMode } from "@/lib/org/install-config";
import { isSoloBootstrapOpen } from "@/lib/org/solo-bootstrap";
import { allowAuthAttempt } from "@/lib/rate-limit";

import { signIn } from "./auth";

const authFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginActionState = {
  status: "idle" | "in_progress" | "success" | "failed" | "invalid_data";
};

export const login = async (
  _: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!(await allowAuthAttempt(validatedData.email))) {
      return { status: "failed" };
    }

    await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirectTo: "/",
    });

    return { status: "success" };
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    return { status: "failed" };
  }
};

export type RegisterActionState = {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "failed"
    | "user_exists"
    | "invalid_data"
    | "registration_closed";
};

export const register = async (
  _: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> => {
  if (isOrgInstallMode() || !(await isSoloBootstrapOpen())) {
    return { status: "registration_closed" };
  }

  try {
    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!(await allowAuthAttempt(validatedData.email))) {
      return { status: "failed" };
    }

    const [user] = await getUser(validatedData.email);

    if (user) {
      return { status: "user_exists" } as RegisterActionState;
    }
    await createUser(validatedData.email, validatedData.password);
    await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirectTo: "/",
    });

    return { status: "success" };
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    return { status: "failed" };
  }
};
