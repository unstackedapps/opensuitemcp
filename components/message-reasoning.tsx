"use client";

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
  return (
    <Reasoning
      data-testid="message-reasoning"
      defaultOpen={false}
      isStreaming={isLoading}
      reasoningText={reasoning}
    >
      <ReasoningTrigger />
      <ReasoningContent>{reasoning}</ReasoningContent>
    </Reasoning>
  );
}
