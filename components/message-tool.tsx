"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import type { ToolUIPart } from "ai";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "./message-elements/tool";

type MessageToolProps = {
  toolCallId: string;
  type: ToolUIPart["type"];
  state: ToolUIPart["state"];
  input?: ToolUIPart["input"];
  output?: React.ReactNode;
  errorText?: string;
};

export function MessageTool({
  toolCallId,
  type,
  state,
  input,
  output,
  errorText,
}: MessageToolProps) {
  const [isOpen, setIsOpen] = useControllableState({
    defaultProp: false, // Keep closed by default, user can open if curious
  });

  return (
    <Tool key={toolCallId} onOpenChange={setIsOpen} open={isOpen}>
      <ToolHeader state={state} type={type} />
      <ToolContent>
        {state === "input-available" && input !== undefined && (
          <ToolInput input={input} />
        )}
        {(state === "output-available" || state === "output-error") && (
          <ToolOutput errorText={errorText} output={output} />
        )}
      </ToolContent>
    </Tool>
  );
}
