import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  listCommunityCatalogSkills,
  listOracleCatalogSkills,
} from "@/lib/ai/skills/catalog";
import { syncCommunitySkills } from "@/lib/ai/skills/sync-community";
import { syncOracleSkills } from "@/lib/ai/skills/sync-oracle";
import {
  formatSkillSyncError,
  withSkillSyncRetry,
} from "@/lib/ai/skills/sync-with-retry";
import { skillsPackSyncEnabled } from "@/lib/product-features";

const bodySchema = z.object({
  pack: z.enum(["oracle", "community"]),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.type !== "regular") {
    return NextResponse.json(
      { error: "Sign in to refresh skill packs." },
      { status: 403 },
    );
  }

  if (!skillsPackSyncEnabled) {
    return NextResponse.json(
      {
        error:
          "Skill pack refresh is disabled on this instance. Packs are synced by the operator.",
      },
      { status: 403 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  try {
    if (body.pack === "oracle") {
      await withSkillSyncRetry("Oracle sync", syncOracleSkills);
    } else {
      await withSkillSyncRetry("Community sync", syncCommunitySkills);
    }

    return NextResponse.json({
      pack: body.pack,
      catalog:
        body.pack === "oracle"
          ? listOracleCatalogSkills()
          : listCommunityCatalogSkills(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: formatSkillSyncError(error) },
      { status: 400 },
    );
  }
}
