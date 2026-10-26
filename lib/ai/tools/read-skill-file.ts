import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { pageSkillFile } from "@/lib/ai/skills/catalog";
import {
  readUserSkillFile,
  resolveUserSkillSurface,
} from "@/lib/ai/skills/user-surface";
import { getUserSettings } from "@/lib/db/queries";

type ReadSkillFileOptions = {
  userId: string;
  orgId: string | null;
};

/**
 * Read one reference file beside a skill's SKILL.md.
 *
 * A skill is a folder: SKILL.md is injected for the turn and the material it
 * points at stays on disk until something asks for it. Without this the
 * instructions in an injected skill would name files nothing could open —
 * which is what a skill pack means when it says "run references/intake.md".
 */
export function createReadSkillFileTool({
  userId,
  orgId,
}: ReadSkillFileOptions) {
  return tool({
    description:
      "Read a reference file belonging to one of the skills active in this conversation. A skill's instructions may point at files beside it, such as `references/intake.md`; call this to read one when the instructions say to. Pass the skill's name or id and the path exactly as the instructions give it. Path `SKILL.md` reads the skill's own instructions, for one cut short or left out of this turn. A long file comes back in pages: pass `nextOffset` from one page as `offset` to read the next.",
    inputSchema: z.object({
      skill: z
        .string()
        .describe("The skill's name or id, as the instructions name it."),
      path: z
        .string()
        .describe("Path relative to the skill, e.g. `references/intake.md`."),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Character to start from; `nextOffset` of the last page."),
    }),
    execute: async ({ skill, path, offset }) => {
      const settings = await getUserSettings({ userId });
      const surface = await resolveUserSkillSurface({
        userId,
        orgId,
        settings: settings ?? {},
        disabledOrgConnectedSkillSourceIds:
          settings?.disabledOrgConnectedSkillSourceIds,
      });

      const needle = skill.trim().toLowerCase();
      const match =
        surface.find((entry) => entry.id.toLowerCase() === needle) ??
        surface.find((entry) => entry.name.toLowerCase() === needle) ??
        surface.find((entry) => entry.slug?.toLowerCase() === needle);

      if (!match || match.mode === "off") {
        return {
          error: `No skill "${skill}" is active in this conversation.`,
          availableSkills: surface
            .filter((entry) => entry.mode !== "off")
            .map((entry) => entry.name),
        };
      }

      const content = await readUserSkillFile({
        userId,
        orgId,
        settings: settings ?? {},
        skill: match,
        path,
      });

      if (content === null) {
        return {
          error: `${match.name} has no file "${path}".`,
          files: match.files ?? [],
          ...(match.fileCount ? { fileCount: match.fileCount } : {}),
        };
      }

      return { skill: match.name, path, ...pageSkillFile(content, offset) };
    },
  });
}
