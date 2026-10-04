import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  composeDictatedInput,
  DICTATION_LANGUAGES,
  describeSpeechError,
  parseLanguagePreference,
  parsePunctuationPreference,
  readSpokenText,
  resolveDictationLanguage,
  type SpeechResultEvent,
  serializePunctuationPreference,
} from "./dictation";

function spokenEvent(...segments: Array<[string, boolean]>): SpeechResultEvent {
  return {
    resultIndex: 0,
    results: segments.map(([transcript, isFinal]) =>
      Object.assign([{ transcript }], { isFinal }),
    ),
  };
}

describe("what a spoken result does to the composer", () => {
  it("keeps what was already typed and puts speech after it", () => {
    assert.equal(
      composeDictatedInput("Check the", "vendor ledger"),
      "Check the vendor ledger",
    );
  });

  it("does not double the space between them", () => {
    assert.equal(
      composeDictatedInput("Check the   ", "  vendor ledger  "),
      "Check the vendor ledger",
    );
  });

  it("returns the spoken text alone when the composer was empty", () => {
    assert.equal(composeDictatedInput("", "vendor ledger"), "vendor ledger");
  });

  it("leaves the composer untouched before the first word", () => {
    assert.equal(composeDictatedInput("Check the", "   "), "Check the");
    assert.equal(composeDictatedInput("", ""), "");
  });
});

describe("reading a recognition event", () => {
  it("joins the final segments with the one still being heard", () => {
    const event = spokenEvent(
      ["Run the report ", true],
      ["for subsidiary seven", false],
    );
    assert.equal(readSpokenText(event), "Run the report for subsidiary seven");
  });

  it("reads nothing from an event with no segments", () => {
    assert.equal(readSpokenText(spokenEvent()), "");
  });

  it("skips a segment the browser left without an alternative", () => {
    const event: SpeechResultEvent = {
      resultIndex: 0,
      results: [
        Object.assign([] as { transcript: string }[], { isFinal: true }),
      ],
    };
    assert.equal(readSpokenText(event), "");
  });
});

describe("which recognition errors are worth a word", () => {
  it("names the ones a person can act on", () => {
    assert.equal(
      describeSpeechError("not-allowed"),
      "Microphone access is blocked for this site.",
    );
    assert.equal(
      describeSpeechError("audio-capture"),
      "No microphone was found.",
    );
  });

  it("stays quiet about the ones that arrive during normal use", () => {
    assert.equal(describeSpeechError("no-speech"), null);
    assert.equal(describeSpeechError("aborted"), null);
  });
});

describe("the punctuation preference", () => {
  it("is on in a browser that has never been told otherwise", () => {
    assert.equal(parsePunctuationPreference(null), true);
  });

  it("is off only when it was turned off", () => {
    assert.equal(parsePunctuationPreference("off"), false);
    assert.equal(parsePunctuationPreference("on"), true);
  });

  it("treats an unreadable value as on rather than as an opt-out", () => {
    assert.equal(parsePunctuationPreference(""), true);
    assert.equal(parsePunctuationPreference("{}"), true);
  });

  it("round-trips through what it stores", () => {
    for (const enabled of [true, false]) {
      assert.equal(
        parsePunctuationPreference(serializePunctuationPreference(enabled)),
        enabled,
      );
    }
  });
});

describe("the dictation language", () => {
  it("falls back to the browser when nothing is stored", () => {
    assert.equal(resolveDictationLanguage(null, "en-GB"), "en-GB");
  });

  it("uses a stored tag over the browser's", () => {
    assert.equal(resolveDictationLanguage("fr-CA", "en-GB"), "fr-CA");
  });

  it("ignores a tag that is not on the list", () => {
    assert.equal(parseLanguagePreference("klingon"), null);
    assert.equal(resolveDictationLanguage("klingon", "en-GB"), "en-GB");
  });

  it("passes a region-less browser language through rather than guessing one", () => {
    assert.equal(resolveDictationLanguage(null, "en"), "en");
  });

  it("has a tag to fall back to when the browser names none", () => {
    assert.equal(resolveDictationLanguage(null, undefined), "en-US");
  });

  it("offers each language once, already sorted", () => {
    assert.equal(new Set(DICTATION_LANGUAGES).size, DICTATION_LANGUAGES.length);
    assert.deepEqual([...DICTATION_LANGUAGES].sort(), [...DICTATION_LANGUAGES]);
  });

  it("names every tag as language and region", () => {
    for (const tag of DICTATION_LANGUAGES) {
      assert.match(
        tag,
        /^[a-z]{2,3}-[A-Z]{2}$/,
        `${tag} is not language-REGION`,
      );
    }
  });
});
