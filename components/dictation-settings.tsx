"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import {
  DICTATION_LANGUAGES,
  readLanguagePreference,
  readPunctuationPreference,
  resolveDictationLanguage,
  writeLanguagePreference,
  writePunctuationPreference,
} from "@/lib/speech/dictation";
import { isMenuTypeaheadKey } from "@/lib/ui/menu-typeahead";

/**
 * Whether this browser can punctuate at all.
 *
 * `unspokenPunctuation` arrived in Chrome 151. Safari and Samsung Internet
 * recognize speech without it, and there is nothing to switch there.
 */
function supportsPunctuation(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const scope = window as unknown as {
    SpeechRecognition?: new () => object;
    webkitSpeechRecognition?: new () => object;
  };
  const Constructor = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  if (!Constructor) {
    return false;
  }
  try {
    return "unspokenPunctuation" in new Constructor();
  } catch {
    return false;
  }
}

function nameLanguage(tag: string): string {
  try {
    const names = new Intl.DisplayNames(navigator.languages, {
      type: "language",
    });
    return names.of(tag) ?? tag;
  } catch {
    return tag;
  }
}

export function DictationSettings() {
  const languageId = useId();
  const switchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  const [punctuationSupported, setPunctuationSupported] = useState<
    boolean | null
  >(null);
  const [punctuate, setPunctuate] = useState(true);
  const [language, setLanguage] = useState<string | null>(null);
  const [browserLanguage, setBrowserLanguage] = useState<string>("en-US");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Every answer here comes from the browser, so none is known before mount.
  useEffect(() => {
    setPunctuationSupported(supportsPunctuation());
    setPunctuate(readPunctuationPreference());
    setLanguage(readLanguagePreference());
    setBrowserLanguage(navigator.language);
  }, []);

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (open && searchRef.current) {
      // Small delay to ensure the dropdown content is rendered
      setTimeout(() => {
        searchRef.current?.focus();
      }, 100);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return DICTATION_LANGUAGES;
    }
    return DICTATION_LANGUAGES.filter(
      (tag) =>
        tag.toLowerCase().includes(query) ||
        nameLanguage(tag).toLowerCase().includes(query),
    );
  }, [search]);

  const triggerLabel = language
    ? `${nameLanguage(language)} — ${language}`
    : `Browser default — ${nameLanguage(
        resolveDictationLanguage(null, browserLanguage),
      )}`;

  const select = (tag: string | null) => {
    setLanguage(tag);
    writeLanguagePreference(tag);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className="divide-y divide-border/60">
      <SettingRow
        control={
          <DropdownMenu
            onOpenChange={(isOpen) => {
              setOpen(isOpen);
              if (!isOpen) {
                setSearch("");
              }
            }}
            open={open}
          >
            <DropdownMenuTrigger asChild>
              <Button
                className="h-8 w-80 justify-between gap-2 text-sm"
                id={languageId}
                type="button"
                variant="outline"
              >
                <span className="truncate">{triggerLabel}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="flex max-h-[min(300px,var(--radix-dropdown-menu-content-available-height))] w-(--radix-dropdown-menu-trigger-width) flex-col overflow-hidden p-0"
            >
              <div className="shrink-0 border-b p-2">
                <Input
                  className="h-8 text-sm"
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && search) {
                      setSearch("");
                      event.preventDefault();
                      event.stopPropagation();
                      return;
                    }
                    if (isMenuTypeaheadKey(event.key)) {
                      event.stopPropagation();
                    }
                  }}
                  placeholder="Search languages..."
                  ref={searchRef}
                  value={search}
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-1">
                <DropdownMenuItem onSelect={() => select(null)}>
                  Browser default —{" "}
                  {nameLanguage(
                    resolveDictationLanguage(null, browserLanguage),
                  )}
                </DropdownMenuItem>
                {filtered.map((tag) => (
                  <DropdownMenuItem key={tag} onSelect={() => select(tag)}>
                    {nameLanguage(tag)} — {tag}
                  </DropdownMenuItem>
                ))}
                {filtered.length === 0 ? (
                  <div className="py-6 text-center text-muted-foreground text-sm">
                    No languages found
                  </div>
                ) : null}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        }
        description="Speech is recognized in this language. The browser's own is used unless you pick another."
        title="Language"
      />

      {punctuationSupported ? (
        <SettingRow
          control={
            <Switch
              checked={punctuate}
              id={switchId}
              onCheckedChange={(enabled) => {
                setPunctuate(enabled);
                writePunctuationPreference(enabled);
              }}
            />
          }
          description={
            <>
              Punctuation is inferred from your pauses, and a halting sentence
              picks up marks it did not earn. Saying &ldquo;period&rdquo; types
              the word.
            </>
          }
          title="Add punctuation automatically"
        />
      ) : null}

      {punctuationSupported === false ? (
        <SettingRow
          description="Chrome and Edge offer that setting."
          title="This browser recognizes speech without punctuating it"
        />
      ) : null}
    </div>
  );
}
