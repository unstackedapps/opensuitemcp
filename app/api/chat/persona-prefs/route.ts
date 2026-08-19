import { cookies } from "next/headers";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { isBuiltinPersonaId } from "@/lib/ai/personas/ids";
import {
  DEFAULT_PERSONA_ID_COOKIE,
  HIDE_PERSONA_PICKER_COOKIE,
} from "@/lib/ai/personas/preferences";
import { ChatSDKError } from "@/lib/errors";

const bodySchema = z.object({
  hidePersonaPicker: z.boolean().optional(),
  defaultPersonaId: z.string().max(64).optional().nullable(),
});

/** Guest (and any user) cookie prefs for Do not show again + default persona. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  try {
    const body = bodySchema.parse(await request.json());
    const cookieStore = await cookies();

    if (body.hidePersonaPicker !== undefined) {
      if (body.hidePersonaPicker) {
        cookieStore.set(HIDE_PERSONA_PICKER_COOKIE, "1", {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
          sameSite: "lax",
        });
      } else {
        cookieStore.delete(HIDE_PERSONA_PICKER_COOKIE);
      }
    }

    if (body.defaultPersonaId !== undefined) {
      const id = body.defaultPersonaId?.trim() || "ava";
      if (!isBuiltinPersonaId(id)) {
        return Response.json(
          { error: "Guest default persona must be a builtin id" },
          { status: 400 },
        );
      }
      cookieStore.set(DEFAULT_PERSONA_ID_COOKIE, id, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }
    return new ChatSDKError("bad_request:api").toResponse();
  }
}
