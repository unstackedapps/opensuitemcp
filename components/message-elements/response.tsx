"use client";

import type { ComponentProps, ElementType, HTMLAttributes } from "react";
import { memo } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

type ResponseProps = ComponentProps<typeof Streamdown>;

/**
 * Renders as div instead of p to avoid invalid HTML when markdown contains
 * block elements (e.g. code blocks) inside paragraphs. Fixes hydration error:
 * "In HTML, <div> cannot be a descendant of <p>"
 */
const ParagraphAsDiv = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => <div className={className} {...props} />;

export const Response = memo(
  ({ className, components, ...props }: ResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_code]:whitespace-pre-wrap [&_code]:wrap-break-word [&_pre]:max-w-full [&_pre]:overflow-x-auto",
        className,
      )}
      components={{
        ...components,
        p: ParagraphAsDiv as ElementType,
      }}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

Response.displayName = "Response";
