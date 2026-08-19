export type PersonaPlaybookDraft = {
  name: string;
  shortName: string;
  primaryRole?: string;
  content: string;
};

type MessagePartLike = {
  type: string;
  text?: string;
  input?: Record<string, unknown>;
  output?: unknown;
};

type MessageLike = {
  role: string;
  parts?: MessagePartLike[];
};

function metadataField(raw: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = raw.match(
    new RegExp(`^\\s*-\\s*\\*\\*${escaped}:\\*\\*\\s*(.+)$`, "im"),
  );
  return match?.[1]?.trim();
}

export function looksLikePersonaPlaybook(text: string): boolean {
  const body = text.trim();
  if (body.length < 200) {
    return false;
  }
  const hasInstructions = /##\s+Persona Instructions/i.test(body);
  const hasMetadata =
    /##\s+Persona Metadata/i.test(body) ||
    /#\s+OpenSuiteMCP Persona:/i.test(body);
  return hasInstructions && hasMetadata;
}

function draftFromRecord(
  record: Record<string, unknown>,
): PersonaPlaybookDraft | null {
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const shortName =
    typeof record.shortName === "string" ? record.shortName.trim() : "";
  const content =
    typeof record.content === "string" ? record.content.trim() : "";
  const primaryRole =
    typeof record.primaryRole === "string"
      ? record.primaryRole.trim()
      : undefined;
  if (!(name && shortName && looksLikePersonaPlaybook(content))) {
    return null;
  }
  return {
    name: name.slice(0, 200),
    shortName: shortName.slice(0, 40),
    ...(primaryRole ? { primaryRole: primaryRole.slice(0, 300) } : {}),
    content: content.slice(0, 32_000),
  };
}

function draftFromProposePart(
  part: MessagePartLike,
): PersonaPlaybookDraft | null {
  if (part.type !== "tool-proposeCustomPersona") {
    return null;
  }
  if (part.output && typeof part.output === "object") {
    const output = part.output as Record<string, unknown>;
    if (output.ok === true) {
      const fromOutput = draftFromRecord(output);
      if (fromOutput) {
        return fromOutput;
      }
    }
  }
  if (part.input) {
    return draftFromRecord(part.input);
  }
  return null;
}

export function parsePlaybookDraft(content: string): PersonaPlaybookDraft {
  const cleaned = stripMarkdownFence(content).trim().slice(0, 32_000);
  const titleMatch = cleaned.match(/^#\s+OpenSuiteMCP Persona:\s*(.+)$/im);
  const name =
    metadataField(cleaned, "Name") ||
    titleMatch?.[1]?.trim() ||
    "Custom NetSuite Persona";
  const shortName =
    metadataField(cleaned, "Short Name") || name.split(/\s+/).at(0) || "Custom";
  const primaryRole = metadataField(cleaned, "Primary Role");
  return {
    name: name.slice(0, 200),
    shortName: shortName.slice(0, 40),
    ...(primaryRole ? { primaryRole: primaryRole.slice(0, 300) } : {}),
    content: cleaned,
  };
}

export function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return trimmed;
}

/** Prefer a proposeCustomPersona tool playbook over interview recap text. */
export function extractPersonaPlaybookDraft(
  messages: MessageLike[],
): PersonaPlaybookDraft | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages.at(index);
    if (!message?.parts) {
      continue;
    }
    for (
      let partIndex = message.parts.length - 1;
      partIndex >= 0;
      partIndex--
    ) {
      const part = message.parts.at(partIndex);
      if (!part) {
        continue;
      }
      const fromTool = draftFromProposePart(part);
      if (fromTool) {
        return fromTool;
      }
    }
  }

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages.at(index);
    if (message?.role !== "assistant" || !message.parts) {
      continue;
    }
    const chunks = message.parts
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text?.trim() ?? "")
      .filter(Boolean);
    const text = chunks.join("\n\n");
    if (looksLikePersonaPlaybook(text)) {
      return parsePlaybookDraft(text);
    }
  }

  return null;
}

export function interviewTranscriptFromMessages(
  messages: MessageLike[],
  maxChars = 24_000,
): string {
  const blocks: string[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }
    const texts = (message.parts ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text?.trim() ?? "")
      .filter(Boolean);
    if (texts.length === 0) {
      continue;
    }
    const label = message.role === "user" ? "User" : "Assistant";
    blocks.push(`${label}:\n${texts.join("\n\n")}`);
  }
  const joined = blocks.join("\n\n");
  if (joined.length <= maxChars) {
    return joined;
  }
  return joined.slice(joined.length - maxChars);
}

export const PERSONA_PLAYBOOK_WRITER_PROMPT = `You write OpenSuiteMCP persona playbooks that are injected as system prompts.

You are not interviewing. Do not recap the conversation. Do not mention "the interview", "the user said", or "based on our discussion".

Write the persona in second person as operating instructions ("You are a …").

Output ONLY markdown, no preamble, in this exact shape:

# OpenSuiteMCP Persona: {Display Name}

## Persona Metadata

- **Name:** {Display Name}
- **Short Name:** {compact label, one or two words}
- **Primary Role:** {one-line description of the specialist}
- **Default Risk Posture:** {Conservative | Balanced | Aggressive}
- **Recommended Write Policy:** {when to confirm writes}
- **Recommended Default Mode:** {how the assistant should start}

---

## Persona Instructions

{Who they are, what they own, how they should behave in OpenSuiteMCP.}

## Operating Principles

{Numbered practical rules.}

## Preferred Tools / Approaches

{SuiteQL vs UI vs SuiteScript vs saved searches, MCP habits.}

## Boundaries / Never-dos

{Hard constraints.}

Keep it practical for NetSuite work through OpenSuiteMCP.`;
