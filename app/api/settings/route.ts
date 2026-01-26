import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getUserSettings, upsertUserSettings } from "@/lib/db/queries";
import { decrypt, encrypt } from "@/lib/encryption";

const settingsSchema = z.object({
  googleApiKey: z.string().optional().nullable(),
  anthropicApiKey: z.string().optional().nullable(),
  aiProvider: z.enum(["google", "anthropic"]).optional().nullable(),
  netsuiteAccountId: z.string().max(64).optional().nullable(),
  netsuiteClientId: z.string().max(128).optional().nullable(),
  timezone: z.string().max(64).optional().nullable(),
  searchDomainIds: z.array(z.string()).max(16).optional().nullable(),
});

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getUserSettings({ userId: session.user.id });

    if (!settings) {
      return NextResponse.json({
        googleApiKey: null,
        anthropicApiKey: null,
        aiProvider: "google",
        netsuiteAccountId: null,
        netsuiteClientId: null,
        timezone: "UTC",
        searchDomainIds: [],
      });
    }

    // Decrypt API keys if present
    let decryptedGoogleKey: string | null = null;
    if (settings.googleApiKey) {
      try {
        decryptedGoogleKey = decrypt(settings.googleApiKey);
      } catch (error) {
        console.error(
          "[Settings API] Error decrypting Google API key on GET:",
          error,
        );
        decryptedGoogleKey = null;
      }
    }

    let decryptedAnthropicKey: string | null = null;
    if (settings.anthropicApiKey) {
      try {
        decryptedAnthropicKey = decrypt(settings.anthropicApiKey);
      } catch (error) {
        console.error(
          "[Settings API] Error decrypting Anthropic API key on GET:",
          error,
        );
        decryptedAnthropicKey = null;
      }
    }

    // Ensure aiProvider is always a valid value
    const provider =
      settings.aiProvider === "google" || settings.aiProvider === "anthropic"
        ? settings.aiProvider
        : "google";

    return NextResponse.json({
      googleApiKey: decryptedGoogleKey,
      anthropicApiKey: decryptedAnthropicKey,
      aiProvider: provider,
      netsuiteAccountId: settings.netsuiteAccountId,
      netsuiteClientId: settings.netsuiteClientId,
      timezone: settings.timezone ?? "UTC",
      searchDomainIds: settings.searchDomainIds ?? [],
    });
  } catch (error) {
    console.error("[Settings] Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = settingsSchema.partial().parse(body);

    // Get existing settings to preserve values not being updated
    const existing = await getUserSettings({ userId: session.user.id });

    // Encrypt Google API key if provided
    let encryptedGoogleKey: string | null | undefined;
    if (validated.googleApiKey !== undefined) {
      const trimmedKey = validated.googleApiKey?.trim();
      if (trimmedKey) {
        try {
          encryptedGoogleKey = encrypt(trimmedKey);
        } catch (error) {
          console.error("[Settings] Error encrypting Google API key:", error);
          return NextResponse.json(
            {
              error:
                "Failed to encrypt Google API key. Please check ENCRYPTION_KEY environment variable.",
            },
            { status: 500 },
          );
        }
      } else {
        encryptedGoogleKey = null;
      }
    } else if (existing?.googleApiKey) {
      encryptedGoogleKey = existing.googleApiKey;
    }

    // Encrypt Anthropic API key if provided
    let encryptedAnthropicKey: string | null | undefined;
    if (validated.anthropicApiKey !== undefined) {
      const trimmedKey = validated.anthropicApiKey?.trim();
      if (trimmedKey) {
        try {
          encryptedAnthropicKey = encrypt(trimmedKey);
        } catch (error) {
          console.error(
            "[Settings] Error encrypting Anthropic API key:",
            error,
          );
          return NextResponse.json(
            {
              error:
                "Failed to encrypt Anthropic API key. Please check ENCRYPTION_KEY environment variable.",
            },
            { status: 500 },
          );
        }
      } else {
        encryptedAnthropicKey = null;
      }
    } else if (existing?.anthropicApiKey) {
      encryptedAnthropicKey = existing.anthropicApiKey;
    }

    await upsertUserSettings({
      userId: session.user.id,
      googleApiKey: encryptedGoogleKey,
      anthropicApiKey: encryptedAnthropicKey,
      aiProvider: validated.aiProvider,
      netsuiteAccountId: validated.netsuiteAccountId,
      netsuiteClientId: validated.netsuiteClientId,
      timezone: validated.timezone,
      searchDomainIds:
        validated.searchDomainIds !== undefined
          ? (validated.searchDomainIds ?? [])
          : undefined,
    });

    return NextResponse.json({
      success: true,
      message: "Settings saved successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid settings data", details: error.errors },
        { status: 400 },
      );
    }

    console.error("[Settings] Error saving settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 },
    );
  }
}
