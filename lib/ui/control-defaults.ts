/**
 * Which of a control's responsive defaults survive a caller's className.
 *
 * `Input` and `SelectTrigger` size themselves differently above 768px — `md:h-10`, `md:px-3`,
 * `md:py-2`. A caller writing `h-8` or `pl-9` without an `md:` twin loses at
 * every width from there up, because a media query beats an unprefixed rule
 * whatever `tailwind-merge` does with the class list: the two live in different
 * variant groups, so both are kept and the later one wins in the stylesheet.
 *
 * That is why a search field's placeholder slid under its icon, and why a
 * select asking for `h-8` beside an input asking for the same stood 8px taller
 * than it. Three call sites had already written `pl-10 md:pl-10` by hand. Dropping the
 * responsive default when the caller has said something about that property
 * fixes the class of bug and changes nothing for a caller that has not.
 */

const RESPONSIVE_DEFAULTS = [
  { className: "md:h-10", pattern: /(?:^|\s)!?h-/ },
  { className: "md:px-3", pattern: /(?:^|\s)!?p(?:x|l|r)-/ },
  { className: "md:py-2", pattern: /(?:^|\s)!?p(?:y|t|b)-/ },
] as const;

export function controlResponsiveDefaults(className?: string): string {
  const supplied = className ?? "";
  return RESPONSIVE_DEFAULTS.filter((entry) => !entry.pattern.test(supplied))
    .map((entry) => entry.className)
    .join(" ");
}
