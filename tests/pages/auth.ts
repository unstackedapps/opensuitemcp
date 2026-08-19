import type { Page } from "@playwright/test";
import { expect } from "../fixtures";
import { ChatPage } from "./chat";

export class AuthPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async gotoLogin() {
    await this.page.goto("/login");
    await expect(
      this.page.getByRole("heading", { name: "Sign In" }),
    ).toBeVisible();
  }

  async gotoRegister() {
    await this.page.goto("/register");
    await expect(
      this.page.getByRole("heading", { name: "Sign Up" }),
    ).toBeVisible();
  }

  async register(email: string, password: string) {
    await this.gotoRegister();
    await this.page.getByPlaceholder("user@acme.com").click();
    await this.page.getByPlaceholder("user@acme.com").fill(email);
    await this.page.getByLabel("Password").click();
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: "Sign Up" }).click();
  }

  async login(email: string, password: string) {
    await this.gotoLogin();
    await this.page.getByPlaceholder("user@acme.com").click();
    await this.page.getByPlaceholder("user@acme.com").fill(email);
    await this.page.getByLabel("Password").click();
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: "Sign In" }).click();
    await this.page.waitForURL("/");
    await new ChatPage(this.page).selectPersona("ava");
  }

  async logout(email: string, password: string) {
    await this.login(email, password);

    await this.openSidebar();

    const userNavButton = this.page.getByTestId("user-nav-button");
    await expect(userNavButton).toBeVisible();

    await userNavButton.click();
    const userNavMenu = this.page.getByTestId("user-nav-menu");
    await expect(userNavMenu).toBeVisible();

    const authMenuItem = this.page.getByTestId("user-nav-item-auth");
    await expect(authMenuItem).toContainText("Sign out");

    await authMenuItem.click();

    await this.openSidebar();
    await this.page.getByTestId("user-nav-button").click();
    const userEmail = this.page.getByTestId("user-email");
    await expect(userEmail).toContainText("Guest");
  }

  async expectToastToContain(text: string) {
    await expect(this.page.getByTestId("toast")).toContainText(text);
  }

  async openSidebar() {
    const sidebarToggleButton = this.page.getByTestId("sidebar-toggle-button");
    await sidebarToggleButton.click();
  }
}
