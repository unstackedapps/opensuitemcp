"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type ConversationProps = ComponentProps<"div">;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <div
    className={cn("relative flex min-w-0 flex-col", className)}
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<"div">;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => (
  <div className={cn("min-w-0", className)} {...props} />
);
