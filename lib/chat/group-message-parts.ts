export function isAssistantToolPartType(type: string): boolean {
  return (
    // A tool an agent ran elsewhere and recorded over Agent access. It belongs
    // in the turn's tool deck beside this app's own, not loose in the prose.
    type === "dynamic-tool" ||
    type === "tool-searchNetsuiteDocs" ||
    type === "tool-readWebpage" ||
    type === "tool-getCurrentConfig" ||
    type === "tool-proposeCustomPersona" ||
    type === "tool-updatePersonaInterview" ||
    type.startsWith("tool-searchWeb_") ||
    type.startsWith("tool-ns_")
  );
}

/** Parts that never render a card and must not split a tool deck. */
function isInvisibleMessagePart(part: {
  type: string;
  text?: string;
}): boolean {
  if (part.type === "step-start" || part.type.startsWith("data-")) {
    return true;
  }
  if (part.type === "text" || part.type === "reasoning") {
    return !part.text?.trim();
  }
  return false;
}

export type GroupedMessagePart<T> =
  | { kind: "single"; part: T; index: number }
  | { kind: "tools"; items: Array<{ part: T; index: number }> };

export function collectToolParts<T extends { type: string; text?: string }>(
  parts: T[] | undefined,
): Array<{ part: T; index: number }> {
  const items: Array<{ part: T; index: number }> = [];
  for (const group of groupMessageParts(parts)) {
    if (group.kind !== "tools") {
      continue;
    }
    for (const item of group.items) {
      items.push(item);
    }
  }
  return items;
}

export function groupMessageParts<T extends { type: string; text?: string }>(
  parts: T[] | undefined,
): Array<GroupedMessagePart<T>> {
  const groups: Array<GroupedMessagePart<T>> = [];
  if (!parts) {
    return groups;
  }

  for (const [index, part] of parts.entries()) {
    if (isAssistantToolPartType(part.type)) {
      const last = groups.at(-1);
      if (last?.kind === "tools") {
        last.items.push({ part, index });
      } else {
        groups.push({ kind: "tools", items: [{ part, index }] });
      }
      continue;
    }

    if (isInvisibleMessagePart(part)) {
      continue;
    }

    groups.push({ kind: "single", part, index });
  }

  return groups;
}
