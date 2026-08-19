import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type RequestHints, systemPrompt } from "../prompts";
import { resolvePersona } from "./catalog";

const hints: RequestHints = {
  latitude: undefined,
  longitude: undefined,
  city: undefined,
  country: undefined,
};

describe("systemPrompt personas", () => {
  it("keeps Ava identity by default", () => {
    const prompt = systemPrompt({
      selectedChatModel: "chat-model",
      requestHints: hints,
    });
    assert.match(prompt, /You are Ava/);
    assert.match(prompt, /get explicit user confirmation first/);
    assert.match(prompt, /Never run SuiteQL without user confirmation/);
    assert.match(prompt, /ERROR RECOVERY/);
    assert.match(prompt, /business errors inside a successful call/);
    assert.match(prompt, /Missing\/invalid required params/);
    assert.match(prompt, /NETSUITE RECORD LINKS/);
    assert.match(prompt, /mandatory formatting/);
    assert.match(prompt, /Bold-only names are incorrect/);
    assert.match(prompt, /system\.netsuite\.com/);
  });

  it("uses the active account host for record deep links", () => {
    const prompt = systemPrompt({
      selectedChatModel: "chat-model",
      requestHints: hints,
      netsuiteAccountId: "TD3107923",
    });
    assert.match(
      prompt,
      /https:\/\/td3107923\.app\.netsuite\.com\/app\/common\/item\/item\.nl\?id=252/,
    );
    assert.match(prompt, /never leave them as bold-only text/);
    assert.doesNotMatch(
      prompt,
      /Account UI base: https:\/\/system\.netsuite\.com/,
    );
  });

  it("protects record-link directive for personas", () => {
    const persona = resolvePersona({
      personaId: "inventory-supply-chain-analyst",
    });
    const prompt = systemPrompt({
      selectedChatModel: "chat-model",
      requestHints: hints,
      netsuiteAccountId: "td3107923",
      persona: {
        name: persona.name,
        instructions: persona.instructions,
        confirmBeforeSuiteQL: persona.confirmBeforeSuiteQL,
      },
    });
    assert.match(
      prompt,
      /record names in chat must be markdown links into the account UI/,
    );
  });

  it("injects specialist playbook and relaxes SuiteQL confirm for analyst", () => {
    const persona = resolvePersona({ personaId: "suiteql-data-analyst" });
    const prompt = systemPrompt({
      selectedChatModel: "chat-model",
      requestHints: hints,
      persona: {
        name: persona.name,
        instructions: persona.instructions,
        confirmBeforeSuiteQL: persona.confirmBeforeSuiteQL,
      },
    });
    assert.match(prompt, /This session's identity is SuiteQL Data Analyst/);
    assert.doesNotMatch(prompt, /You are Ava,/);
    assert.match(prompt, /PERSONA PLAYBOOK/);
    assert.match(prompt, /SuiteQL/);
    assert.match(
      prompt,
      /may run SuiteQL after metadata discovery without asking for confirmation/,
    );
    assert.match(prompt, /Remain this session's named specialist/);
    assert.match(prompt, /Confirm before writes/);
  });

  it("keeps SuiteQL confirmation for administrator", () => {
    const persona = resolvePersona({ personaId: "netsuite-administrator" });
    const prompt = systemPrompt({
      selectedChatModel: "chat-model",
      requestHints: hints,
      persona: {
        name: persona.name,
        instructions: persona.instructions,
        confirmBeforeSuiteQL: persona.confirmBeforeSuiteQL,
      },
    });
    assert.match(prompt, /Confirm before SuiteQL/);
  });
});
