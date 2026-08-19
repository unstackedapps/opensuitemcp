import { splitTextOnSlashSkillTokens } from "@/lib/ai/skills/slash-tokens";
import { cn, sanitizeText } from "@/lib/utils";

type UserMessageTextWithSkillBadgesProps = {
  text: string;
  invokedSlugs?: Set<string>;
  className?: string;
};

export function UserMessageTextWithSkillBadges({
  text,
  invokedSlugs,
  className,
}: UserMessageTextWithSkillBadgesProps) {
  const segments = splitTextOnSlashSkillTokens(text, invokedSlugs);

  return (
    <div className={cn("whitespace-pre-wrap", className)}>
      {segments.map((segment) => {
        if (segment.kind === "skill") {
          return (
            <span
              className="mx-0.5 inline-flex items-center rounded-full border border-border/60 bg-background/40 px-2 py-0.5 font-medium text-xs align-middle"
              key={`skill-${segment.start}-${segment.slug}`}
            >
              /{segment.slug}
            </span>
          );
        }

        return (
          <span key={`text-${segment.start}`}>
            {sanitizeText(segment.value)}
          </span>
        );
      })}
    </div>
  );
}
