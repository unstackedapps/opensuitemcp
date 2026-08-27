import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  getSoloOidcLoginSettings,
  removeSoloOidcLogin,
  setSoloOidcLoginEnabled,
  updateSoloOidcLogin,
  upsertSoloOidcLogin,
} from "@/lib/org/solo-oidc-login";
import type { SoloOidcLoginAccount } from "@/lib/org/solo-oidc-login-types";

const upsertSchema = z.object({
  accountId: z.string().min(1).max(64),
  clientId: z.string().min(1).max(128).optional(),
  name: z.string().max(128).optional(),
  oidcAccountId: z.string().uuid().optional(),
});

const accountIdSchema = z.object({
  oidcAccountId: z.string().uuid(),
});

const enabledSchema = accountIdSchema.extend({
  enabled: z.boolean(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getSoloOidcLoginSettings(session.user.id);
    return NextResponse.json(settings);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load OIDC settings.";
    const status = message.includes("solo mode") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = upsertSchema.parse(body);

    let account: SoloOidcLoginAccount;
    if (validated.oidcAccountId) {
      const name = validated.name?.trim() || validated.accountId;
      if (validated.clientId) {
        account = await upsertSoloOidcLogin({
          userId: session.user.id,
          accountId: validated.accountId,
          clientId: validated.clientId,
          name,
        });
      } else {
        account = await updateSoloOidcLogin({
          userId: session.user.id,
          oidcAccountId: validated.oidcAccountId,
          name,
        });
      }
    } else {
      if (!validated.clientId) {
        return NextResponse.json(
          { error: "OIDC client ID is required." },
          { status: 400 },
        );
      }
      account = await upsertSoloOidcLogin({
        userId: session.user.id,
        accountId: validated.accountId,
        clientId: validated.clientId,
        name: validated.name,
      });
    }

    const settings = await getSoloOidcLoginSettings(session.user.id);
    return NextResponse.json({ account, settings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid OIDC settings payload." },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Failed to save OIDC settings.";
    const status = message.includes("solo mode") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = enabledSchema.parse(body);
    await setSoloOidcLoginEnabled({
      oidcAccountId: validated.oidcAccountId,
      enabled: validated.enabled,
    });
    const settings = await getSoloOidcLoginSettings(session.user.id);
    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid OIDC settings payload." },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update OIDC settings.";
    const status = message.includes("solo mode") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = accountIdSchema.parse(body);
    await removeSoloOidcLogin({ oidcAccountId: validated.oidcAccountId });
    const settings = await getSoloOidcLoginSettings(session.user.id);
    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid OIDC settings payload." },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error
        ? error.message
        : "Failed to remove OIDC settings.";
    const status = message.includes("solo mode") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
