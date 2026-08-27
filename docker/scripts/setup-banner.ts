/** OpenSuiteMCP install banner (Claude Code–style TUI header). */

/** Back / left chat bubble — matches OpenSuiteMCPLogo */
export const BANNER_BUBBLE_LEFT_RGB = [0x4a, 0x81, 0xe8] as const;

/** Front / right chat bubble — matches OpenSuiteMCPLogo */
export const BANNER_BUBBLE_RIGHT_RGB = [0xea, 0x58, 0x0d] as const;

type BubbleColor = "left" | "right";

type BannerSegment = {
  text: string;
  color?: BubbleColor;
};

const BANNER_SEGMENTS: BannerSegment[][] = [
  [
    { text: "╭─────────╮", color: "left" },
    {
      text: "           ____                      _____         _  __         __  ___ ______ ____ ",
    },
  ],
  [
    { text: "│", color: "left" },
    { text: "      " },
    { text: "╭─────────╮", color: "right" },
    {
      text: "   / __ \\ ____   ___   ____  / ___/ __  __ (_)/ /_ ___   /  |/  // ____// __ \\",
    },
  ],
  [
    { text: "│", color: "left" },
    { text: "      " },
    { text: "│         │", color: "right" },
    {
      text: "  / / / // __ \\ / _ \\ / __ \\ \\__ \\ / / / // // __// _ \\ / /|_/ // /    / /_/ /",
    },
  ],
  [
    { text: "╰─╮  ", color: "left" },
    { text: "╭─", color: "left" },
    { text: "│         │", color: "right" },
    {
      text: " / /_/ // /_/ //  __// / / /___/ // /_/ // // /_ /  __// /  / // /___ / ____/ ",
    },
  ],
  [
    { text: "  ╰──/ ", color: "left" },
    { text: "╰────╮  ╭─╯", color: "right" },
    {
      text: " \\____// .___/ \\___//_/ /_//____/ \\__,_//_/ \\__/ \\___//_/  /_/ \\____//_/      ",
    },
  ],
  [{ text: "             ╲─╯", color: "right" }, { text: "        /_/" }],
];

const PLAIN_BANNER = BANNER_SEGMENTS.map((line) =>
  line.map((segment) => segment.text).join(""),
).join("\n");

export const OPEN_SUITE_MCP_BANNER = PLAIN_BANNER;

const rgb = (values: readonly [number, number, number]): string =>
  `\x1b[38;2;${values[0]};${values[1]};${values[2]}m`;

const COLOR_CODES: Record<BubbleColor, string> = {
  left: rgb(BANNER_BUBBLE_LEFT_RGB),
  right: rgb(BANNER_BUBBLE_RIGHT_RGB),
};

const RESET = "\x1b[0m";

export function formatOpenSuiteMcpBanner(options?: {
  color?: boolean;
}): string {
  const useColor = options?.color ?? Boolean(process.stdout.isTTY);

  if (!useColor) {
    return PLAIN_BANNER;
  }

  return BANNER_SEGMENTS.map((line) =>
    line
      .map((segment) => {
        if (!segment.color) {
          return segment.text;
        }
        return `${COLOR_CODES[segment.color]}${segment.text}${RESET}`;
      })
      .join(""),
  ).join("\n");
}
