import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  MAX_SKILL_BUNDLE_CHARS,
  MAX_SKILL_FILE_CHARS,
} from "@/lib/ai/skills/bundle";
import { MAX_SKILL_FILES, normalizeSkillFilePath } from "@/lib/ai/skills/ids";
import { readSkillFiles, replaceSkillFiles } from "@/lib/db/skill-files";

const bodySchema = z.object({
  files: z
    .array(
      z.object({
        path: z.string().max(256),
        content: z.string().max(MAX_SKILL_FILE_CHARS),
      }),
    )
    .max(MAX_SKILL_FILES),
});

/** The reference files beside one custom skill's SKILL.md. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const files = await readSkillFiles({
    userId: session.user.id,
    skillId: decodeURIComponent(id),
  });
  return NextResponse.json({ files });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const files: Array<{ path: string; content: string }> = [];
  let total = 0;
  for (const file of parsed.data.files) {
    const path = normalizeSkillFilePath(file.path);
    if (!path) {
      return NextResponse.json(
        { error: `\`${file.path}\` is not a path inside the skill folder.` },
        { status: 400 },
      );
    }
    total += file.content.length;
    files.push({ path, content: file.content });
  }
  if (total > MAX_SKILL_BUNDLE_CHARS) {
    return NextResponse.json(
      {
        error: `A skill's reference files are limited to ${MAX_SKILL_BUNDLE_CHARS} characters in total.`,
      },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  await replaceSkillFiles({
    userId: session.user.id,
    skillId: decodeURIComponent(id),
    files,
  });
  return NextResponse.json({ ok: true, count: files.length });
}
