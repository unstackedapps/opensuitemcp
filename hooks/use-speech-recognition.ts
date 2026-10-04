"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  describeSpeechError,
  readLanguagePreference,
  readPunctuationPreference,
  readSpokenText,
  resolveDictationLanguage,
  type SpeechResultEvent,
} from "@/lib/speech/dictation";

/**
 * Dictation in the composer, using the browser rather than a provider.
 *
 * This app is BYO-LLM, and of the five providers it can be configured with only
 * `@ai-sdk/openai` exposes a transcription model. `experimental_transcribe`
 * would therefore serve one user in five and ask the rest for a key they have no
 * other use for. The browser speaks for all of them, costs nothing, and on
 * Chrome and Edge keeps the audio on the machine.
 *
 * Firefox has kept `SpeechRecognition` behind `dom.webspeech.recognition.enable`
 * since Firefox 22 and has never enabled it for users, so the microphone does
 * not render there. Feature detection, not a provider check, decides that.
 */

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  /** Chrome and Edge only. Elsewhere recognition is always remote. */
  processLocally?: boolean;
  /** Chrome 151+. Infers punctuation from pauses rather than spoken commands. */
  unspokenPunctuation?: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

/** `available` and `install` are Chrome's on-device additions, and static. */
type SpeechRecognitionConstructor = (new () => BrowserSpeechRecognition) & {
  available?: (options: {
    langs: string[];
    processLocally: boolean;
  }) => Promise<"available" | "downloadable" | "downloading" | "unavailable">;
  install?: (options: {
    langs: string[];
    processLocally: boolean;
  }) => Promise<boolean>;
};

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/**
 * Whether this session can run on the machine.
 *
 * A model that is only downloadable starts downloading now and serves the next
 * session; waiting for it before the first word costs more than the round trip
 * it saves.
 */
async function resolveProcessLocally(
  Recognition: SpeechRecognitionConstructor,
  language: string,
): Promise<boolean> {
  try {
    const status = await Recognition.available?.({
      langs: [language],
      processLocally: true,
    });
    if (status === "downloadable") {
      void Recognition.install?.({ langs: [language], processLocally: true });
    }
    return status === "available";
  } catch {
    // An older Chrome throws rather than reporting "unavailable". Remote
    // recognition still works, which is what every other browser does.
    return false;
  }
}

export function useSpeechRecognition({
  lang,
  onError,
  onSpoken,
}: {
  /** Defaults to the browser's own language. */
  lang?: string;
  onError?: (message: string) => void;
  onSpoken: (spoken: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const wantListeningRef = useRef(false);
  const onSpokenRef = useRef(onSpoken);
  const onErrorRef = useRef(onError);

  onSpokenRef.current = onSpoken;
  onErrorRef.current = onError;

  // The constructor is read after mount, because the server has no window.
  useEffect(() => {
    setSupported(getRecognitionConstructor() !== null);
  }, []);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(async () => {
    const Recognition = getRecognitionConstructor();
    if (!Recognition || wantListeningRef.current) {
      return;
    }

    const language =
      lang ??
      resolveDictationLanguage(
        readLanguagePreference(),
        typeof navigator === "undefined" ? undefined : navigator.language,
      );

    const processLocally = await resolveProcessLocally(Recognition, language);

    const recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.processLocally = processLocally;

    // Chrome dropped spoken punctuation commands — "period", "comma" — from the
    // Web Speech API in January 2023, and nothing replaced them until Chrome 151
    // shipped `unspokenPunctuation`, which infers punctuation from pauses and
    // intonation instead. It defaults to false, so a long prompt arrives as one
    // unbroken sentence unless this is set.
    if ("unspokenPunctuation" in recognition) {
      recognition.unspokenPunctuation = readPunctuationPreference();
    }

    recognition.onresult = (event) => {
      onSpokenRef.current(readSpokenText(event));
    };

    recognition.onerror = (event) => {
      const message = describeSpeechError(event.error);
      if (!message) {
        // Silence here is why a broken configuration looked like a dead
        // microphone: the session ended, nothing was written, and nothing said
        // why.
        console.warn("[dictation] recognition error:", event.error);
        return;
      }
      wantListeningRef.current = false;
      setListening(false);
      onErrorRef.current?.(message);
    };

    // Chrome ends the session after a silence however `continuous` is set, so a
    // toggle only behaves like one if it reopens while the button is still on.
    recognition.onend = () => {
      if (!wantListeningRef.current) {
        setListening(false);
        return;
      }
      try {
        recognition.start();
      } catch {
        wantListeningRef.current = false;
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    wantListeningRef.current = true;
    try {
      recognition.start();
      setListening(true);
    } catch {
      wantListeningRef.current = false;
      setListening(false);
    }
  }, [lang]);

  // A session left open outlives the composer otherwise.
  useEffect(
    () => () => {
      wantListeningRef.current = false;
      recognitionRef.current?.abort();
    },
    [],
  );

  return { listening, start, stop, supported };
}
