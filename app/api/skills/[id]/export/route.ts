import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  skillMarkdownWithFrontmatter,
  writeSkillZip,
} from "@/lib/ai/skills/bundle";
import { slugifySkillName } from "@/lib/ai/skills/modes";
import {
  readUserSkillContent,
  readUserSkillFile,
} from "@/lib/ai/skills/user-surface";
import { getUserSettings } from "@/lib/db/queries";

/**
 * Download one skill.
 *
 * A skill with no reference files is a single SKILL.md, because a one-file zip
 * is a worse thing to receive. A skill with references is the folder, so what
 * comes out can be handed straight to a repo or imported somewhere else.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await context.params;
  const skillId = decodeURIComponent(rawId);
  const settings = await getUserSettings({ userId: session.user.id });

  const found = await readUserSkillContent({
    userId: session.user.id,
    orgId: session.user.orgId ?? null,
    settings: settings ?? {},
    skillId,
    disabledOrgConnectedSkillSourceIds:
      settings?.disabledOrgConnectedSkillSourceIds,
  });
  if (!found) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  const folder =
    found.skill.slug ?? slugifySkillName(found.skill.name, "skill");
  const markdown = skillMarkdownWithFrontmatter({
    name: found.skill.name,
    description:
      found.skill.description === "Custom skill"
        ? undefined
        : found.skill.description,
    content: found.content,
  });

  const paths = found.skill.files ?? [];
  const wantsZip =
    new URL(request.url).searchParams.get("format") === "zip" ||
    paths.length > 0;

  if (!wantsZip) {
    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${folder}.md"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const files: Array<{ path: string; content: string }> = [];
  for (const path of paths) {
    const content = await readUserSkillFile({
      userId: session.user.id,
      orgId: session.user.orgId ?? null,
      settings: settings ?? {},
      skill: found.skill,
      path,
    });
    if (content !== null) {
      files.push({ path, content });
    }
  }

  const zip = writeSkillZip({ content: markdown, files }, folder);
  return new NextResponse(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${folder}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
