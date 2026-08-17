import { expect, type Page } from "@playwright/test";

const CHAT_ID_REGEX =
  /^http:\/\/localhost:\d+\/chat\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class ChatPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get sendButton() {
    return this.page.getByTestId("send-button");
  }

  get stopButton() {
    return this.page.getByTestId("stop-button");
  }

  get multimodalInput() {
    return this.page.getByTestId("multimodal-input");
  }

  get personaPicker() {
    return this.page.getByTestId("persona-picker");
  }

  get personaBadge() {
    return this.page.getByTestId("persona-badge");
  }

  get scrollContainer() {
    return this.page.locator(".overflow-y-scroll");
  }

  get scrollToBottomButton() {
    return this.page.getByTestId("scroll-to-bottom-button");
  }

  async createNewChat() {
    await this.page.goto("/");
    await Promise.race([
      this.personaPicker.waitFor({ state: "visible", timeout: 30_000 }),
      this.multimodalInput.waitFor({ state: "visible", timeout: 30_000 }),
    ]);
    await this.ensurePersonaSelected();
    await expect(this.multimodalInput).toBeVisible();
    await expect(this.multimodalInput).toBeEnabled();
  }

  /** Open home without selecting a persona (picker should appear). */
  async gotoHome() {
    await this.page.goto("/");
  }

  /** Choose a persona from the first-chat picker (required before sending). */
  async selectPersona(
    personaId = "ava",
    options: { doNotShowAgain?: boolean } = {},
  ) {
    const dialog = this.personaPicker;
    await expect(dialog).toBeVisible({ timeout: 30_000 });

    if (options.doNotShowAgain) {
      const prefsResponse = this.page
        .waitForResponse(
          (response) =>
            (response.url().includes("/api/chat/persona-prefs") ||
              response.url().includes("/api/settings")) &&
            response.request().method() === "POST",
          { timeout: 15_000 },
        )
        .catch(() => null);
      await dialog.getByTestId("persona-do-not-show-again").check();
      await dialog.getByTestId(`persona-option-${personaId}`).click();
      await prefsResponse;
    } else {
      await dialog.getByTestId(`persona-option-${personaId}`).click();
    }

    await expect(dialog).toBeHidden();
    await expect(this.multimodalInput).toBeVisible();
    await expect(this.multimodalInput).toBeEnabled();
  }

  /** If the picker is open, select Ava; otherwise continue. */
  async ensurePersonaSelected(personaId = "ava") {
    if (await this.multimodalInput.isEnabled().catch(() => false)) {
      return;
    }

    const dialog = this.personaPicker;
    const pickerVisible = await dialog
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!pickerVisible) {
      return;
    }

    await this.selectPersona(personaId);
  }

  async changePersona(personaId: string) {
    await expect(this.personaBadge).toBeVisible();
    await this.personaBadge.click();
    await this.selectPersona(personaId);
  }

  async openPersonaDetails(personaId: string) {
    const dialog = this.personaPicker;
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByTestId(`persona-details-${personaId}`).click();
    await expect(this.page.getByTestId("persona-details-dialog")).toBeVisible();
  }

  async openSkillsPortal() {
    await this.page.getByTestId("sidebar-skills-button").click();
    const portal = this.page.getByTestId("app-portal");
    await expect(portal).toBeVisible();
    await expect(this.page.getByTestId("skills-panel")).toBeVisible();
  }

  async openPersonasPortal() {
    await this.openSkillsPortal();
    await this.page.getByTestId("portal-nav-personas").click();
    await expect(this.page.getByTestId("personas-panel")).toBeVisible();
  }

  async closeAppPortal() {
    await this.page.keyboard.press("Escape");
    await expect(this.page.getByTestId("app-portal")).toBeHidden();
  }

  getCurrentURL(): string {
    return this.page.url();
  }

  async sendUserMessage(message: string) {
    await this.ensurePersonaSelected();
    await this.multimodalInput.click();
    await this.multimodalInput.fill(message);
    await this.sendButton.click();
  }

  async waitForChatPost() {
    const response = await this.page.waitForResponse((currentResponse) => {
      try {
        const { pathname } = new URL(currentResponse.url());
        return (
          currentResponse.request().method() === "POST" &&
          pathname === "/api/chat"
        );
      } catch {
        return false;
      }
    });
    await response.finished();
    return response;
  }

  async isGenerationComplete() {
    await expect(this.page.getByTestId("message-assistant").last()).toBeVisible({
      timeout: 30_000,
    });
    await expect(this.sendButton).toBeVisible({ timeout: 30_000 });
  }

  async isVoteComplete() {
    const response = await this.page.waitForResponse((currentResponse) =>
      currentResponse.url().includes("/api/vote"),
    );

    await response.finished();
  }

  async hasChatIdInUrl() {
    await expect(this.page).toHaveURL(CHAT_ID_REGEX);
  }

  async isElementVisible(elementId: string) {
    await expect(this.page.getByTestId(elementId)).toBeVisible();
  }

  async isElementNotVisible(elementId: string) {
    await expect(this.page.getByTestId(elementId)).not.toBeVisible();
  }

  async getSelectedModel() {
    const modelId = await this.page.getByTestId("model-selector").innerText();
    return modelId;
  }

  async chooseModelFromSelector(chatModelId: string) {
    await this.page.getByTestId("model-selector").click();
    await this.page.getByTestId("model-selector-mode").click();
    const item = this.page.getByTestId(`model-selector-item-${chatModelId}`);
    await expect(item).toBeVisible();
    await item.click();
    await expect(this.page.getByTestId("model-selector-mode")).toBeHidden();
  }

  async getSelectedVisibility() {
    const visibilityId = await this.page
      .getByTestId("visibility-selector")
      .innerText();
    return visibilityId;
  }

  async chooseVisibilityFromSelector(chatVisibility: "public" | "private") {
    await this.page.getByTestId("visibility-selector").click();
    await this.page
      .getByTestId(`visibility-selector-item-${chatVisibility}`)
      .click();
    expect(await this.getSelectedVisibility()).toBe(chatVisibility);
  }

  async getRecentAssistantMessage() {
    const messageElements = await this.page
      .getByTestId("message-assistant")
      .all();
    const lastMessageElement = messageElements.at(-1);

    if (!lastMessageElement) {
      return null;
    }

    const content = await lastMessageElement
      .getByTestId("message-content")
      .innerText()
      .catch(() => null);

    const reasoningElement = await lastMessageElement
      .getByTestId("message-reasoning")
      .isVisible()
      .then(async (visible) =>
        visible
          ? await lastMessageElement
              .getByTestId("message-reasoning")
              .innerText()
          : null,
      )
      .catch(() => null);

    return {
      element: lastMessageElement,
      content,
      reasoning: reasoningElement,
      async toggleReasoningVisibility() {
        await lastMessageElement
          .getByTestId("message-reasoning-toggle")
          .click();
      },
      async upvote() {
        await lastMessageElement.getByTestId("message-upvote").click();
      },
      async downvote() {
        await lastMessageElement.getByTestId("message-downvote").click();
      },
    };
  }

  async getRecentUserMessage() {
    const messageElements = await this.page.getByTestId("message-user").all();
    const lastMessageElement = messageElements.at(-1);

    if (!lastMessageElement) {
      throw new Error("No user message found");
    }

    const content = await lastMessageElement
      .getByTestId("message-content")
      .innerText()
      .catch(() => null);

    const page = this.page;

    return {
      element: lastMessageElement,
      content,
      async edit(newMessage: string) {
        const generation = page.waitForResponse((currentResponse) => {
          try {
            const { pathname } = new URL(currentResponse.url());
            return (
              currentResponse.request().method() === "POST" &&
              pathname === "/api/chat"
            );
          } catch {
            return false;
          }
        });
        await page.getByTestId("message-edit-button").click();
        await page.getByTestId("message-editor").fill(newMessage);
        await page.getByTestId("message-editor-send-button").click();
        await expect(
          page.getByTestId("message-editor-send-button"),
        ).not.toBeVisible();
        await generation;
      },
    };
  }

  async expectToastToContain(text: string) {
    await expect(this.page.getByTestId("toast")).toContainText(text);
  }

  async openSideBar() {
    const sidebarToggleButton = this.page.getByTestId("sidebar-toggle-button");
    await sidebarToggleButton.click();
  }

  isScrolledToBottom(): Promise<boolean> {
    return this.scrollContainer.evaluate(
      (el) => Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 1,
    );
  }

  async waitForScrollToBottom(timeout = 5000): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      if (await this.isScrolledToBottom()) {
        return;
      }
      await this.page.waitForTimeout(100);
    }

    throw new Error(`Timed out waiting for scroll bottom after ${timeout}ms`);
  }

  async sendMultipleMessages(
    count: number,
    makeMessage: (i: number) => string,
  ) {
    for (let i = 0; i < count; i++) {
      await this.sendUserMessage(makeMessage(i));
      await this.isGenerationComplete();
    }
  }

  async scrollToTop(): Promise<void> {
    await this.scrollContainer.evaluate((element) => {
      element.scrollTop = 0;
    });
  }
}
