"use client";

import { useEffect, useState } from "react";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "./message-elements/reasoning";

type MessageReasoningProps = {
  isLoading: boolean;
  reasoning: string;
};

export function MessageReasoning({
  isLoading,
  reasoning,
}: MessageReasoningProps) {
  const [open, setOpen] = useState(isLoading);

  useEffect(() => {
    if (!isLoading) {
      setOpen(false);
    }
  }, [isLoading]);

  return (
    <Reasoning
      data-testid="message-reasoning"
      isStreaming={isLoading}
      onOpenChange={setOpen}
      open={open}
      reasoningText={reasoning}
    >
      <ReasoningTrigger />
      <ReasoningContent>{reasoning}</ReasoningContent>
    </Reasoning>
  );
}
