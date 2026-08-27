import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendProviderEntry,
  ensureSeededProviderConfig,
  ensureUniqueProviderLabel,
  findDuplicateProviderLabel,
  isCanonicalSeedEntry,
  isMultiAiProviders,
  listVisibleProviderEntries,
  migrateLegacyKeysToEntries,
  parseAiProviderConfig,
  resolveChatProviderSelection,
  seedDefaultProviderList,
  stockCanonicalSeedEntry,
  stripUnconfiguredCanonicalSeeds,
  supportsHostedModelOverrides,
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

  it("falls back to default when the chat provider is missing", () => {
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
    assert.equal(resolved.dangling, false);
    assert.equal(resolved.entry?.id, "a");
  });

  it("falls back to default when the chat provider is unconfigured", () => {
    const resolved = resolveChatProviderSelection(
      "google-seed",
      {
        defaultId: "openai-seed",
        providers: [
          {
            id: "google-seed",
            label: "Google",
            type: "google",
            apiKey: null,
            maxIterations: "10",
          },
          {
            id: "openai-seed",
            label: "OpenAI",
            type: "openai",
            apiKey: "k",
            maxIterations: "12",
          },
        ],
      },
      {},
    );
    assert.equal(resolved.entry?.id, "openai-seed");
    assert.equal(resolved.maxIterations, 12);
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

  it("starts with no providers when there is no saved config or legacy keys", () => {
    const config = ensureSeededProviderConfig(null);
    assert.equal(config.providers.length, 0);
    assert.equal(config.defaultId, null);
  });

  it("migrates legacy keys without seeding empty hosted slots", () => {
    const config = ensureSeededProviderConfig(null, {
      openaiApiKey: "test-key",
      aiProvider: "openai",
    });
    assert.equal(config.providers.length, 1);
    assert.equal(config.providers[0]?.type, "openai");
    assert.equal(config.providers[0]?.apiKey, "test-key");
  });

  it("strips unconfigured canonical seeds from saved config", () => {
    const config = stripUnconfiguredCanonicalSeeds(
      seedDefaultProviderList({
        openaiApiKey: "test-key",
        aiProvider: "openai",
      }),
    );
    assert.equal(config.providers.length, 1);
    assert.equal(config.providers[0]?.type, "openai");
    assert.deepEqual(
      listVisibleProviderEntries(
        seedDefaultProviderList({
          openaiApiKey: "test-key",
          aiProvider: "openai",
        }),
      ).map((entry) => entry.type),
      ["openai"],
    );
  });

  it("keeps configured canonical seeds visible", () => {
    const config = ensureSeededProviderConfig(
      {
        defaultId: "extra",
        providers: [
          {
            id: "extra",
            label: "openai: work",
            type: "openai",
            apiKey: "w",
            maxIterations: "10",
          },
        ],
      },
      { googleApiKey: "g" },
      () => "seed-google",
    );
    assert.equal(
      listVisibleProviderEntries(config).some(
        (entry) => entry.type === "openai",
      ),
      true,
    );
  });

  it("does not auto-add missing canonical seeds", () => {
    const config = ensureSeededProviderConfig(
      {
        defaultId: "extra",
        providers: [
          {
            id: "extra",
            label: "openai: work",
            type: "openai",
            apiKey: "w",
            maxIterations: "10",
          },
        ],
      },
      { googleApiKey: "g" },
      () => "seed-google",
    );
    assert.equal(config.providers.length, 1);
    assert.equal(config.providers[0]?.label, "openai: work");
  });

  it("treats a new draft with canonical label as non-canonical when id differs", () => {
    const saved = seedDefaultProviderList();
    const draft = {
      id: "new-google-draft",
      label: "GOOGLE",
      type: "google" as const,
      apiKey: "",
      maxIterations: "10",
    };
    assert.equal(isCanonicalSeedEntry(draft, saved.providers), false);
    assert.equal(supportsHostedModelOverrides(draft, saved.providers), true);
  });

  it("resets a canonical seed to stock settings", () => {
    const reset = stockCanonicalSeedEntry({
      id: "google-seed",
      label: "Google",
      type: "google",
      apiKey: "sk-test",
      maxIterations: "18",
      speedModelId: "gemini-other",
      reasoningModelId: "gemini-other-pro",
      baseUrl: "https://example.invalid",
    });
    assert.deepEqual(reset, {
      id: "google-seed",
      label: "Google",
      type: "google",
      apiKey: null,
      maxIterations: "10",
    });
  });

  it("auto-increments duplicate labels", () => {
    const existing = [
      {
        id: "1",
        label: "Google",
        type: "google" as const,
        apiKey: null,
        maxIterations: "10",
      },
    ];
    assert.equal(ensureUniqueProviderLabel("Google", existing), "Google (1)");
    assert.equal(
      ensureUniqueProviderLabel("Google", [
        ...existing,
        {
          id: "2",
          label: "Google (1)",
          type: "google",
          apiKey: null,
          maxIterations: "10",
        },
      ]),
      "Google (2)",
    );
  });
});
