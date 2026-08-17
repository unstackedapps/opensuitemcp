import { tool } from "ai";
import { z } from "zod";
import {
  isPersonaInterviewComplete,
  mergePersonaInterviewCoverage,
  normalizePersonaInterviewState,
  PERSONA_INTERVIEW_DIMENSIONS,
  type PersonaInterviewState,
  type ProposeCustomPersonaResult,
  type UpdatePersonaInterviewResult,
} from "@/lib/ai/personas/interview";
import { updateChatPersonaInterview } from "@/lib/db/queries";

export type {
  ProposeCustomPersonaResult,
  UpdatePersonaInterviewResult,
} from "@/lib/ai/personas/interview";

const dimensionSchema = z.enum(PERSONA_INTERVIEW_DIMENSIONS);

export function createUpdatePersonaInterviewTool(options: {
  chatId: string;
  getPreviousState: () => PersonaInterviewState | null | undefined;
  onUpdated?: (state: PersonaInterviewState) => void;
}) {
  return tool({
    description:
      "Update which persona-interview coverage dimensions are done. Pass the full list of dimensions covered so far (including prior ones). Call after each answer that advances coverage.",
    inputSchema: z.object({
      covered: z
        .array(dimensionSchema)
        .min(1)
        .describe("All dimensions covered so far (not only the latest)."),
    }),
    execute: async ({ covered }): Promise<UpdatePersonaInterviewResult> => {
      const next = mergePersonaInterviewCoverage(
        options.getPreviousState(),
        covered,
      );
      await updateChatPersonaInterview({
        chatId: options.chatId,
        personaInterview: next,
      });
      options.onUpdated?.(next);
      return {
        ok: true,
        covered: next.covered,
        missing: next.missing,
        complete: isPersonaInterviewComplete(next),
      };
    },
  });
}

export function createProposeCustomPersonaTool(options: {
  getInterviewState: () => PersonaInterviewState | null | undefined;
  onCoverageUpdated?: (state: PersonaInterviewState) => void;
  chatId?: string;
}) {
  return tool({
    description:
      "Propose a finished custom persona playbook for the user to confirm in the UI. Prefer calling after all seven coverage dimensions are covered. Does not save — the user must confirm with Save persona.",
    inputSchema: z.object({
      name: z.string().min(1).max(200),
      shortName: z.string().min(1).max(40),
      primaryRole: z.string().max(300).optional(),
      content: z
        .string()
        .min(1)
        .max(32_000)
        .describe("Full builtin-shaped markdown playbook."),
      covered: z
        .array(dimensionSchema)
        .optional()
        .describe(
          "Optional: dimensions covered so far (include all seven when finishing).",
        ),
    }),
    execute: async ({
      name,
      shortName,
      primaryRole,
      content,
      covered,
    }): Promise<ProposeCustomPersonaResult> => {
      let state = normalizePersonaInterviewState(options.getInterviewState());
      if (covered && covered.length > 0) {
        state = mergePersonaInterviewCoverage(state, covered);
        if (options.chatId) {
          await updateChatPersonaInterview({
            chatId: options.chatId,
            personaInterview: state,
          });
        }
        options.onCoverageUpdated?.(state);
      }

      // Allow propose when playbook is substantial even if coverage tools were skipped
      // (common with smaller local models).
      const substantial = content.trim().length >= 200;
      if (!isPersonaInterviewComplete(state) && !substantial) {
        return {
          ok: false,
          error:
            "Interview incomplete — cover all dimensions before proposing.",
          missing: state.missing,
        };
      }
      return {
        ok: true,
        name: name.trim(),
        shortName: shortName.trim(),
        ...(primaryRole?.trim() ? { primaryRole: primaryRole.trim() } : {}),
        content: content.trim(),
      };
    },
  });
}
