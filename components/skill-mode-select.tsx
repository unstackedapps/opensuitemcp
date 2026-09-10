"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isSkillInvocationMode,
  type SkillInvocationMode,
} from "@/lib/ai/skills/modes";
import { cn } from "@/lib/utils";

const MODE_LABELS = {
  auto: "Auto",
  slash: "Slash command",
  off: "Disabled",
} as const;

export function SkillModeSelect({
  value,
  name,
  disabled,
  pending,
  onChange,
}: {
  value: SkillInvocationMode;
  name: string;
  disabled?: boolean;
  pending?: boolean;
  onChange: (mode: SkillInvocationMode) => void;
}) {
  return (
    <Select
      disabled={disabled || pending}
      onValueChange={(next) => {
        if (isSkillInvocationMode(next)) {
          onChange(next);
        }
      }}
      value={value}
    >
      <SelectTrigger
        aria-busy={pending}
        aria-label={`${name} invocation`}
        className={cn(
          "h-8 w-40 shrink-0 px-2.5 text-xs md:h-8 md:px-2.5 md:text-sm",
          pending && "opacity-60",
          disabled && "cursor-default",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-60">
        <SelectItem value="auto">{MODE_LABELS.auto}</SelectItem>
        <SelectItem value="slash">{MODE_LABELS.slash}</SelectItem>
        <SelectItem value="off">{MODE_LABELS.off}</SelectItem>
      </SelectContent>
    </Select>
  );
}
