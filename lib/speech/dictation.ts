/**
 * The pure half of dictation: what a spoken result means for the composer.
 *
 * Kept out of the hook so it can be tested without a browser. The hook owns the
 * `SpeechRecognition` session; this owns the text.
 */

export type SpeechResultAlternative = { transcript: string };

export type SpeechResult = ArrayLike<SpeechResultAlternative> & {
  isFinal: boolean;
};

export type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
};

/**
 * The text the composer shows while dictation runs.
 *
 * `base` is whatever was in the composer when the microphone opened, so a spoken
 * sentence lands after it rather than replacing it. Typing during dictation is
 * overwritten by the next result, which is how dictation behaves everywhere
 * else; the microphone button is the way to take the composer back.
 */
export function composeDictatedInput(base: string, spoken: string): string {
  const trimmedSpoken = spoken.trim();
  if (!trimmedSpoken) {
    return base;
  }
  const trimmedBase = base.replace(/\s+$/, "");
  if (!trimmedBase) {
    return trimmedSpoken;
  }
  return `${trimmedBase} ${trimmedSpoken}`;
}

/**
 * Everything said this session: the final segments and the one still being heard.
 *
 * The browser keeps every segment in `results` and reuses the list across
 * events, so reading all of it is both correct and cheaper than tracking which
 * segments have already been seen.
 */
export function readSpokenText(event: SpeechResultEvent): string {
  return Array.from(event.results)
    .map((result) => result?.[0]?.transcript ?? "")
    .join("");
}

/** Errors worth a word. The rest end the session quietly. */
const REPORTABLE_ERRORS: Record<string, string> = {
  "audio-capture": "No microphone was found.",
  network: "Speech recognition could not reach the network.",
  "not-allowed": "Microphone access is blocked for this site.",
  "service-not-allowed": "Microphone access is blocked for this site.",
};

/**
 * `no-speech` and `aborted` arrive constantly during normal use and say nothing
 * a person can act on.
 */
export function describeSpeechError(error: string): string | null {
  return REPORTABLE_ERRORS[error] ?? null;
}

/** Where the punctuation preference is kept, beside the canvas width. */
export const PUNCTUATION_STORAGE_KEY = "osmcp:dictation-punctuation";

/**
 * Punctuation is on unless someone turned it off.
 *
 * Chrome infers it from pauses, which suits prose and over-punctuates a halting
 * sentence. Anything other than the stored "off" means on, so a cleared or
 * corrupted value behaves like a fresh browser rather than a silent opt-out.
 */
export function parsePunctuationPreference(stored: string | null): boolean {
  return stored !== "off";
}

export function serializePunctuationPreference(enabled: boolean): string {
  return enabled ? "on" : "off";
}

/** False in a private window, with site data blocked, and during prerender. */
export function readPunctuationPreference(): boolean {
  try {
    return parsePunctuationPreference(
      window.localStorage.getItem(PUNCTUATION_STORAGE_KEY),
    );
  } catch {
    return true;
  }
}

export function writePunctuationPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(
      PUNCTUATION_STORAGE_KEY,
      serializePunctuationPreference(enabled),
    );
  } catch {
    // The switch still moves; it just does not survive the tab.
  }
}

/** Where the dictation language is kept. Absent means the browser's own. */
export const LANGUAGE_STORAGE_KEY = "osmcp:dictation-language";

/**
 * The languages offered in the picker.
 *
 * Curated, because the API cannot be asked. `available({ processLocally: false })`
 * answers "available" for every tag it is given, including ones that are not
 * languages, so it discriminates nothing. Only the on-device check is honest,
 * and it covers a smaller set than the cloud engine recognizes.
 */
export const DICTATION_LANGUAGES: readonly string[] = [
  "af-ZA",
  "ar-EG",
  "ar-SA",
  "bg-BG",
  "ca-ES",
  "cs-CZ",
  "da-DK",
  "de-AT",
  "de-CH",
  "de-DE",
  "el-GR",
  "en-AU",
  "en-CA",
  "en-GB",
  "en-IE",
  "en-IN",
  "en-NZ",
  "en-PH",
  "en-US",
  "en-ZA",
  "es-AR",
  "es-CL",
  "es-CO",
  "es-ES",
  "es-MX",
  "es-PE",
  "es-US",
  "eu-ES",
  "fi-FI",
  "fil-PH",
  "fr-CA",
  "fr-FR",
  "gl-ES",
  "he-IL",
  "hi-IN",
  "hr-HR",
  "hu-HU",
  "id-ID",
  "is-IS",
  "it-CH",
  "it-IT",
  "ja-JP",
  "ko-KR",
  "lt-LT",
  "ms-MY",
  "nb-NO",
  "nl-BE",
  "nl-NL",
  "pl-PL",
  "pt-BR",
  "pt-PT",
  "ro-RO",
  "ru-RU",
  "sk-SK",
  "sr-RS",
  "sv-SE",
  "th-TH",
  "tr-TR",
  "uk-UA",
  "vi-VN",
  "zh-CN",
  "zh-HK",
  "zh-TW",
  "zu-ZA",
];

/** A stored tag, or null for the browser's own language. */
export function parseLanguagePreference(stored: string | null): string | null {
  if (!stored) {
    return null;
  }
  return DICTATION_LANGUAGES.includes(stored) ? stored : null;
}

/**
 * The tag a session runs with.
 *
 * A browser language of `en` with no region is passed through as it stands;
 * the engine resolves a region itself, and guessing one here would put an
 * American accent on a British speaker.
 */
export function resolveDictationLanguage(
  stored: string | null,
  browserLanguage: string | undefined,
): string {
  return parseLanguagePreference(stored) ?? browserLanguage ?? "en-US";
}

export function readLanguagePreference(): string | null {
  try {
    return parseLanguagePreference(
      window.localStorage.getItem(LANGUAGE_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

export function writeLanguagePreference(tag: string | null): void {
  try {
    if (tag === null) {
      window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, tag);
  } catch {
    // The picker still moves; it just does not survive the tab.
  }
}
