"use client";

import { X } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useId,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { ADMIN_SELECT_TRIGGER_CLASS } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MAX_TAGS = 32;

function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function formatTag(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function mergeUserTagDraft(tags: string[], draft: string): string[] {
  const formatted = formatTag(draft);
  if (!formatted) {
    return tags;
  }
  const normalized = normalizeTag(formatted);
  if (tags.some((tag) => normalizeTag(tag) === normalized)) {
    return tags;
  }
  if (tags.length >= MAX_TAGS) {
    return tags;
  }
  return [...tags, formatted];
}

export type UserTagInputHandle = {
  commitDraft: () => string[];
};

type UserTagInputProps = {
  id?: string;
  onChange: (tags: string[]) => void;
  showLabel?: boolean;
  suggestedTags?: string[];
  tags: string[];
  variant?: "boxed" | "plain";
};

export const UserTagInput = forwardRef<UserTagInputHandle, UserTagInputProps>(
  function UserTagInputField(
    {
      id,
      onChange,
      showLabel = true,
      suggestedTags = [],
      tags,
      variant = "boxed",
    },
    ref,
  ) {
    const listId = useId();
    const [draft, setDraft] = useState("");

    const normalizedSelected = useMemo(
      () => new Set(tags.map((tag) => normalizeTag(tag))),
      [tags],
    );

    const suggestions = useMemo(() => {
      const query = normalizeTag(draft);
      if (!query) {
        return [];
      }
      return suggestedTags
        .filter((tag) => {
          const normalized = normalizeTag(tag);
          if (normalizedSelected.has(normalized)) {
            return false;
          }
          return normalized.includes(query);
        })
        .slice(0, 8);
    }, [draft, normalizedSelected, suggestedTags]);

    const commitDraft = useCallback((): string[] => {
      const next = mergeUserTagDraft(tags, draft);
      setDraft("");
      if (next.length !== tags.length) {
        onChange(next);
        return next;
      }
      return tags;
    }, [draft, onChange, tags]);

    useImperativeHandle(ref, () => ({ commitDraft }), [commitDraft]);

    const addTag = (rawValue: string) => {
      const next = mergeUserTagDraft(tags, rawValue);
      if (next.length === tags.length) {
        setDraft("");
        return;
      }
      onChange(next);
      setDraft("");
    };

    const removeTag = (tag: string) => {
      onChange(tags.filter((value) => value !== tag));
    };

    const field = (
      <>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge
                className="gap-1 pr-1 font-normal text-[11px]"
                key={tag}
                variant="secondary"
              >
                <span className="max-w-40 truncate">{tag}</span>
                <Button
                  aria-label={`Remove ${tag}`}
                  className="size-4 rounded-full p-0 hover:bg-muted"
                  onClick={() => removeTag(tag)}
                  type="button"
                  variant="ghost"
                >
                  <X className="size-3" />
                </Button>
              </Badge>
            ))}
          </div>
        ) : null}

        <Input
          className={cn(ADMIN_SELECT_TRIGGER_CLASS, "h-8 text-sm")}
          disabled={tags.length >= MAX_TAGS}
          id={id}
          list={suggestions.length > 0 ? listId : undefined}
          onBlur={() => {
            commitDraft();
          }}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addTag(draft);
              return;
            }
            if (
              event.key === "Backspace" &&
              draft.length === 0 &&
              tags.length > 0
            ) {
              onChange(tags.slice(0, -1));
            }
          }}
          placeholder={
            tags.length >= MAX_TAGS ? "Tag limit reached" : "Add a tag…"
          }
          value={draft}
        />

        {suggestions.length > 0 ? (
          <datalist id={listId}>
            {suggestions.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        ) : null}

        {suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((tag) => (
              <Button
                className="h-6 px-2 text-[11px]"
                key={tag}
                onClick={() => addTag(tag)}
                type="button"
                variant="outline"
              >
                {tag}
              </Button>
            ))}
          </div>
        ) : null}
      </>
    );

    return (
      <div className="space-y-2">
        {showLabel ? (
          <Label className="text-xs" htmlFor={id}>
            Tags
          </Label>
        ) : null}
        {variant === "boxed" ? (
          <div className="rounded-md border border-border/60 p-2">{field}</div>
        ) : (
          <div className="space-y-2">{field}</div>
        )}
      </div>
    );
  },
);
