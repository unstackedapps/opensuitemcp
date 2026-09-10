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
  emptyResult?: boolean;
};

export function MessageTool({
  toolCallId,
  type,
  state,
  input,
  output,
  errorText,
  emptyResult = false,
}: MessageToolProps) {
  const [isOpen, setIsOpen] = useControllableState({
    defaultProp: false, // Keep closed by default, user can open if curious
  });
  const displayState =
    errorText && (state === "output-available" || state === "output-error")
      ? "output-error"
      : state;

  return (
    <Tool key={toolCallId} onOpenChange={setIsOpen} open={isOpen}>
      <ToolHeader
        emptyResult={emptyResult && displayState === "output-available"}
        state={displayState}
        type={type}
      />
      <ToolContent>
        {isOpen ? (
          <>
            {input === undefined ? null : <ToolInput input={input} />}
            {state === "output-available" ||
            state === "output-error" ||
            errorText ? (
              <ToolOutput errorText={errorText} output={output} />
            ) : null}
          </>
        ) : null}
      </ToolContent>
    </Tool>
  );
}
