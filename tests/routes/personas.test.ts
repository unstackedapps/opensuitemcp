import { generateUUID } from "@/lib/utils";
import { expect, test } from "../fixtures";
import { TEST_PROMPTS } from "../prompts/routes";

test.describe
  .serial("/api/personas", () => {
    test("Ada can list builtin personas", async ({ adaContext }) => {
      const response = await adaContext.request.get("/api/personas");
      expect(response.status()).toBe(200);

      const payload = await response.json();
      expect(Array.isArray(payload.personas)).toBe(true);
      expect(payload.personas.length).toBeGreaterThanOrEqual(7);

      const ids = payload.personas.map((persona: { id: string }) => persona.id);
      expect(ids).toContain("ava");
      expect(ids).toContain("netsuite-administrator");
      expect(ids).toContain("suiteql-data-analyst");
      expect(typeof payload.hidePersonaPicker).toBe("boolean");
    });

    test("Ada can load builtin persona markdown", async ({ adaContext }) => {
      const response = await adaContext.request.get("/api/personas/ava");
      expect(response.status()).toBe(200);

      const payload = await response.json();
      expect(payload.id).toBe("ava");
      expect(typeof payload.content).toBe("string");
      expect(payload.content.length).toBeGreaterThan(40);
      expect(payload.content).toContain("Ava");
    });

    test("Ada gets 404 for an unknown persona id", async ({ adaContext }) => {
      const response = await adaContext.request.get(
        "/api/personas/not-a-real-persona",
      );
      expect(response.status()).toBe(404);
    });
  });

test.describe
  .serial("/api/chat/persona-prefs", () => {
    test("guest can persist hide picker and default persona cookies", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByTestId("persona-picker")).toBeVisible();
      const response = await page.request.post("/api/chat/persona-prefs", {
        data: {
          hidePersonaPicker: true,
          defaultPersonaId: "financial-controller",
        },
      });
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    });

    test("guest cannot set a non-builtin default persona", async ({ page }) => {
      await page.goto("/");
      const response = await page.request.post("/api/chat/persona-prefs", {
        data: {
          hidePersonaPicker: true,
          defaultPersonaId: "custom-persona-id",
        },
      });
      expect(response.status()).toBe(400);
    });
  });

test.describe
  .serial("/api/chat persona stamping", () => {
    test("Ada can create a chat stamped with a builtin persona", async ({
      adaContext,
    }) => {
      const chatId = generateUUID();

      const response = await adaContext.request.post("/api/chat", {
        data: {
          id: chatId,
          message: TEST_PROMPTS.SKY.MESSAGE,
          selectedChatModel: "chat-model",
          selectedVisibilityType: "private",
          personaId: "suitescript-developer",
        },
      });
      expect(response.status()).toBe(200);
      await response.text();

      const chatResponse = await adaContext.request.get(`/api/chat/${chatId}`);
      expect(chatResponse.status()).toBe(200);
      const chat = await chatResponse.json();
      expect(chat.personaId).toBe("suitescript-developer");
    });

    test("Ada cannot stamp an unknown persona id", async ({ adaContext }) => {
      const chatId = generateUUID();

      const response = await adaContext.request.post("/api/chat", {
        data: {
          id: chatId,
          message: TEST_PROMPTS.GRASS.MESSAGE,
          selectedChatModel: "chat-model",
          selectedVisibilityType: "private",
          personaId: "not-a-real-persona",
        },
      });
      expect(response.status()).toBe(400);

      const payload = await response.json();
      expect(`${payload.cause ?? ""} ${payload.message ?? ""}`).toContain(
        "Unknown persona",
      );
    });

    test("guest cannot start the persona builder interview", async ({
      page,
    }) => {
      await page.goto("/");
      const response = await page.request.post(
        "/api/chat/persona-builder/start",
        {
          data: {},
        },
      );
      expect([401, 403]).toContain(response.status());
    });
  });
