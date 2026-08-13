import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendProviderEntry,
  findDuplicateProviderLabel,
  isMultiAiProviders,
  migrateLegacyKeysToEntries,
  parseAiProviderConfig,
  resolveChatProviderSelection,
} from "./provider-entries";

describe("provider-entries", () => {
  it("treats empty config as classic", () => {
    assert.equal(isMultiAiProviders({ defaultId: null, providers: [] }), false);
  });

  it("treats any saved list as multi", () => {
    assert.equal(
      isMultiAiProviders({
        defaultId: "a",
        providers: [
          {
            id: "a",
            label: "openai",
            type: "openai",
            apiKey: "enc",
            maxIterations: "10",
          },
        ],
      }),
      true,
    );
  });

  it("migrates non-empty legacy keys and picks default from aiProvider", () => {
    let index = 0;
    const config = migrateLegacyKeysToEntries(
      {
        googleApiKey: "g",
        openaiApiKey: "o",
        aiProvider: "openai",
        maxIterations: "8",
      },
      () => `id-${index++}`,
    );
    assert.deepEqual(
      config.providers.map((entry) => entry.label),
      ["google", "openai"],
    );
    assert.equal(config.defaultId, "id-1");
    assert.equal(config.providers[1]?.maxIterations, "8");
  });

  it("rejects duplicate labels case-insensitively", () => {
    assert.equal(
      findDuplicateProviderLabel([
        {
          id: "1",
          label: "openai: work",
          type: "openai",
          apiKey: "a",
          maxIterations: "10",
        },
        {
          id: "2",
          label: "OpenAI: Work",
          type: "openai",
          apiKey: "b",
          maxIterations: "10",
        },
      ]),
      "OpenAI: Work",
    );
  });

  it("appends a new provider after migrate without colliding labels", () => {
    const migrated = migrateLegacyKeysToEntries(
      { openaiApiKey: "o", aiProvider: "openai" },
      () => "legacy-openai",
    );
    const next = appendProviderEntry(migrated, {
      id: "new",
      label: "openai: work",
      type: "openai",
      apiKey: "w",
      maxIterations: "12",
    });
    assert.equal(next.providers.length, 2);
    assert.equal(next.defaultId, "legacy-openai");
  });

  it("uses legacy provider when not multi even if chat id is set", () => {
    const resolved = resolveChatProviderSelection(
      "ignored",
      { defaultId: null, providers: [] },
      { openaiApiKey: "k", aiProvider: "openai", maxIterations: "7" },
    );
    assert.equal(resolved.source, "legacy");
    assert.equal(resolved.type, "openai");
    assert.equal(resolved.maxIterations, 7);
  });

  it("errors on dangling chat provider id in multi mode", () => {
    const resolved = resolveChatProviderSelection(
      "missing",
      {
        defaultId: "a",
        providers: [
          {
            id: "a",
            label: "openai",
            type: "openai",
            apiKey: "k",
            maxIterations: "10",
          },
        ],
      },
      { openaiApiKey: "k", aiProvider: "openai" },
    );
    assert.equal(resolved.dangling, true);
  });

  it("falls back to defaultId when chat id is null", () => {
    const resolved = resolveChatProviderSelection(
      null,
      {
        defaultId: "b",
        providers: [
          {
            id: "a",
            label: "google",
            type: "google",
            apiKey: "g",
            maxIterations: "5",
          },
          {
            id: "b",
            label: "openai: work",
            type: "openai",
            apiKey: "o",
            maxIterations: "15",
          },
        ],
      },
      { aiProvider: "google", googleApiKey: "g" },
    );
    assert.equal(resolved.source, "list");
    assert.equal(resolved.entry?.id, "b");
    assert.equal(resolved.maxIterations, 15);
  });

  it("parses stored jsonb safely", () => {
    const parsed = parseAiProviderConfig({
      defaultId: "x",
      providers: [
        { id: "x", label: " custom ", type: "custom", apiKey: null },
        { id: "bad" },
      ],
    });
    assert.equal(parsed.providers.length, 1);
    assert.equal(parsed.providers[0]?.label, "custom");
    assert.equal(parsed.providers[0]?.maxIterations, "10");
  });
});
