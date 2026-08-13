import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { fetchProviderModels } from "@/lib/ai/list-provider-models";

const bodySchema = z.object({
  type: z.enum(["google", "anthropic", "openai", "custom"]),
  apiKey: z.string().max(4096).optional().nullable(),
  baseUrl: z.string().max(512).optional().nullable(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = bodySchema.parse(await request.json());
    const models = await fetchProviderModels({
      type: body.type,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
    });
    return NextResponse.json({ models });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to list models for this provider.",
      },
      { status: 400 },
    );
  }
}
