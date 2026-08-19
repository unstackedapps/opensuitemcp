import { getMessageByErrorCode } from "@/lib/errors";
import { expect, test } from "../fixtures";
import { generateRandomTestUser } from "../helpers";
import { AuthPage } from "../pages/auth";
import { ChatPage } from "../pages/chat";

test.describe
  .serial("Guest Session", () => {
    test("Authenticate as guest user when a new session is loaded", async ({
      page,
    }) => {
      const response = await page.goto("/");

      if (!response) {
        throw new Error("Failed to load page");
      }

      let request: ReturnType<typeof response.request> | null =
        response.request();

      const chain: string[] = [];

      while (request) {
        chain.unshift(request.url());
        request = request.redirectedFrom();
      }

      const origin = new URL(response.url()).origin;
      expect(chain).toEqual([
        `${origin}/`,
        `${origin}/api/auth/guest?redirectUrl=${encodeURIComponent(`${origin}/`)}`,
        `${origin}/`,
      ]);
    });

    test("Log out is not available for guest users", async ({ page }) => {
      const chatPage = new ChatPage(page);
      await chatPage.createNewChat();

      const sidebarToggleButton = page.getByTestId("sidebar-toggle-button");
      await sidebarToggleButton.click();

      const userNavButton = page.getByTestId("user-nav-button");
      await expect(userNavButton).toBeVisible();

      await userNavButton.click();
      const userNavMenu = page.getByTestId("user-nav-menu");
      await expect(userNavMenu).toBeVisible();

      const authMenuItem = page.getByTestId("user-nav-item-auth");
      await expect(authMenuItem).toContainText("Login to your account");
    });

    test("Do not authenticate as guest user when an existing non-guest session is active", async ({
      adaContext,
    }) => {
      const response = await adaContext.page.goto("/");

      if (!response) {
        throw new Error("Failed to load page");
      }

      let request: ReturnType<typeof response.request> | null =
        response.request();

      const chain: string[] = [];

      while (request) {
        chain.unshift(request.url());
        request = request.redirectedFrom();
      }

      expect(chain).toEqual([`${new URL(response.url()).origin}/`]);
    });

    test("Allow navigating to /login as guest user", async ({ page }) => {
      await page.goto("/login");
      await page.waitForURL("/login");
      await expect(page).toHaveURL("/login");
    });

    test("Allow navigating to /register as guest user", async ({ page }) => {
      await page.goto("/register");
      await page.waitForURL("/register");
      await expect(page).toHaveURL("/register");
    });

    test("Do not show email in user menu for guest user", async ({ page }) => {
      const chatPage = new ChatPage(page);
      await chatPage.createNewChat();

      const sidebarToggleButton = page.getByTestId("sidebar-toggle-button");
      await sidebarToggleButton.click();

      await page.getByTestId("user-nav-button").click();
      const userEmail = page.getByTestId("user-email");
      await expect(userEmail).toContainText("Guest");
    });
  });

test.describe
  .serial("Login and Registration", () => {
    let authPage: AuthPage;

    const testUser = generateRandomTestUser();

    test.beforeEach(({ page }) => {
      authPage = new AuthPage(page);
    });

    test("Register new account", async () => {
      await authPage.register(testUser.email, testUser.password);
      await authPage.expectToastToContain("Account created successfully!");
    });

    test("Register new account with existing email", async () => {
      await authPage.register(testUser.email, testUser.password);
      await authPage.expectToastToContain("Account already exists!");
    });

    test("Log into account that exists", async ({ page }) => {
      await authPage.login(testUser.email, testUser.password);

      await expect(page.getByTestId("multimodal-input")).toBeVisible();
    });

    test("Display user email in user menu", async ({ page }) => {
      await authPage.login(testUser.email, testUser.password);

      await expect(page.getByTestId("multimodal-input")).toBeVisible();

      authPage.openSidebar();
      await page.getByTestId("user-nav-button").click();
      const userEmail = page.getByTestId("user-email");
      await expect(userEmail).toContainText(testUser.email);
    });

    test("Log out as non-guest user", async () => {
      await authPage.logout(testUser.email, testUser.password);
    });

    test("Do not force create a guest session if non-guest session already exists", async ({
      page,
    }) => {
      await authPage.login(testUser.email, testUser.password);

      authPage.openSidebar();
      await page.getByTestId("user-nav-button").click();
      const userEmail = page.getByTestId("user-email");
      await expect(userEmail).toContainText(testUser.email);

      await page.goto("/api/auth/guest");
      await page.waitForURL("/");
      await new ChatPage(page).selectPersona("ava");

      authPage.openSidebar();
      await page.getByTestId("user-nav-button").click();
      const updatedUserEmail = page.getByTestId("user-email");
      await expect(updatedUserEmail).toContainText(testUser.email);
    });

    test("Log out is available for non-guest users", async ({ page }) => {
      await authPage.login(testUser.email, testUser.password);

      authPage.openSidebar();

      const userNavButton = page.getByTestId("user-nav-button");
      await expect(userNavButton).toBeVisible();

      await userNavButton.click();
      const userNavMenu = page.getByTestId("user-nav-menu");
      await expect(userNavMenu).toBeVisible();

      const authMenuItem = page.getByTestId("user-nav-item-auth");
      await expect(authMenuItem).toContainText("Sign out");
    });

    test("Do not navigate to /register for non-guest users", async ({
      page,
    }) => {
      await authPage.login(testUser.email, testUser.password);

      await page.goto("/register");
      await expect(page).toHaveURL("/");
    });

    test("Do not navigate to /login for non-guest users", async ({ page }) => {
      await authPage.login(testUser.email, testUser.password);

      await page.goto("/login");
      await expect(page).toHaveURL("/");
    });
  });

test.describe("Entitlements", () => {
  let chatPage: ChatPage;

  test.beforeEach(({ page }) => {
    chatPage = new ChatPage(page);
  });

  test("Guest user cannot send more than 20 messages/day", async () => {
    test.fixme();
    await chatPage.createNewChat();

    for (let i = 0; i <= 20; i++) {
      await chatPage.sendUserMessage("Why is the sky blue?");
      await chatPage.isGenerationComplete();
    }

    await chatPage.sendUserMessage("Why is the sky blue?");
    await chatPage.expectToastToContain(
      getMessageByErrorCode("rate_limit:chat"),
    );
  });
});
