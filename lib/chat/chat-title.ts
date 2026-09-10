const MARKDOWN_HEADING = /^#+\s*/;
const BOLD = /\*\*/g;
const ITALIC = /\*/g;
const WRAPPING_QUOTES = /^["']|["']$/g;
const LEADING_COLON = /^:\s*/;
const LABEL_PREFIX = /^(title|summary):\s*/i;
const WHITESPACE = /\s+/g;

export function fallbackChatTitle(text: string): string {
  const collapsed = text.trim().replace(WHITESPACE, " ");
  if (!collapsed) {
    return "New Chat";
  }
  return collapsed;
}

export function sanitizeChatTitle(text: string): string {
  let value = text.trim();
  const firstLine = value.split("\n").at(0);
  value = firstLine?.trim() ?? "";
  value = value.replace(MARKDOWN_HEADING, "");
  value = value.replace(BOLD, "");
  value = value.replace(ITALIC, "");
  value = value.replace(WRAPPING_QUOTES, "");
  value = value.replace(LEADING_COLON, "");
  value = value.replace(LABEL_PREFIX, "");
  value = value.replace(WRAPPING_QUOTES, "");
  value = value.replace(WHITESPACE, " ").trim();
  return value;
}
