import { expect, test } from "../fixtures";
import { generateRandomTestUser } from "../helpers";
import { AuthPage } from "../pages/auth";
import { ChatPage } from "../pages/chat";

test.describe("Persona picker", () => {
  test("shows picker and keeps composer disabled until a persona is chosen", async ({
    page,
  }) => {
    const chatPage = new ChatPage(page);
    await chatPage.gotoHome();

    await expect(chatPage.personaPicker).toBeVisible();
    await expect(
      chatPage.personaPicker.getByTestId("persona-option-ava"),
    ).toBeVisible();
    await expect(
      chatPage.personaPicker.getByTestId(
        "persona-option-netsuite-administrator",
      ),
    ).toBeVisible();
    await expect(chatPage.multimodalInput).toBeDisabled();

    await chatPage.selectPersona("ava");

    await expect(chatPage.personaPicker).toBeHidden();
    await expect(chatPage.multimodalInput).toBeEnabled();
    await expect(chatPage.personaBadge).toContainText("Ava");
  });

  test("selecting a specialist updates the persona badge", async ({ page }) => {
    const chatPage = new ChatPage(page);
    await chatPage.gotoHome();
    await chatPage.selectPersona("suiteql-data-analyst");

    await expect(chatPage.personaBadge).toContainText("SuiteQL Analyst");
    await expect(chatPage.multimodalInput).toHaveAttribute(
      "placeholder",
      /Ask SuiteQL Analyst anything/,
    );
  });

  test("can change persona from the header badge before sending", async ({
    page,
  }) => {
    const chatPage = new ChatPage(page);
    await chatPage.createNewChat();
    await expect(chatPage.personaBadge).toContainText("Ava");

    await chatPage.changePersona("financial-controller");
    await expect(chatPage.personaBadge).toContainText("Controller");
  });

  test("opens persona details from the picker", async ({ page }) => {
    const chatPage = new ChatPage(page);
    await chatPage.gotoHome();
    await chatPage.openPersonaDetails("ava");

    const details = page.getByTestId("persona-details-dialog");
    await expect(details.getByRole("heading", { name: "Ava" })).toBeVisible();
    await expect(details.locator("pre")).not.toBeEmpty({ timeout: 30_000 });

    await page.keyboard.press("Escape");
    await expect(details).toBeHidden();
    await expect(chatPage.personaPicker).toBeVisible();
  });

  test("Do not show again skips the picker on the next new chat", async ({
    page,
  }) => {
    const chatPage = new ChatPage(page);
    await chatPage.gotoHome();
    await chatPage.selectPersona("netsuite-administrator", {
      doNotShowAgain: true,
    });
    await expect(chatPage.personaBadge).toContainText("Administrator");

    await chatPage.gotoHome();
    await expect(chatPage.personaPicker).toBeHidden({ timeout: 15_000 });
    await expect(chatPage.multimodalInput).toBeEnabled();
    await expect(chatPage.personaBadge).toContainText("Administrator");
  });

  test("guests do not see Create my own in the custom tab", async ({
    page,
  }) => {
    const chatPage = new ChatPage(page);
    await chatPage.gotoHome();
    await expect(chatPage.personaPicker).toBeVisible();

    await chatPage.personaPicker.getByRole("tab", { name: "Custom" }).click();
    await expect(
      chatPage.personaPicker.getByText("No custom personas yet."),
    ).toBeVisible();
    await expect(
      chatPage.personaPicker.getByTestId("persona-create-own"),
    ).toHaveCount(0);
  });

  test("registered users see Create my own in the custom tab", async ({
    page,
  }) => {
    const user = generateRandomTestUser();
    const authPage = new AuthPage(page);
    await authPage.register(user.email, user.password);
    await page.waitForURL("/");

    const chatPage = new ChatPage(page);
    await expect(chatPage.personaPicker).toBeVisible();
    await chatPage.personaPicker.getByRole("tab", { name: "Custom" }).click();
    await expect(
      chatPage.personaPicker.getByTestId("persona-create-own"),
    ).toBeVisible();
  });
});

test.describe("Skills and Personas portal", () => {
  test("opens Skills from the sidebar including Connected tab", async ({
    page,
  }) => {
    const chatPage = new ChatPage(page);
    await chatPage.createNewChat();
    await chatPage.openSkillsPortal();

    await expect(page.getByTestId("skills-tab-oracle")).toBeVisible();
    await expect(page.getByTestId("skills-tab-connected")).toBeVisible();

    await page.getByTestId("skills-tab-connected").click();
    await expect(
      page.getByText("No connected skill packs yet."),
    ).toBeVisible();

    await chatPage.closeAppPortal();
  });

  test("opens Personas settings from the app portal", async ({ page }) => {
    const chatPage = new ChatPage(page);
    await chatPage.createNewChat();
    await chatPage.openPersonasPortal();

    await expect(
      page.getByRole("heading", { name: "Personas" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Specialists shape how the assistant approaches/),
    ).toBeVisible();

    await chatPage.closeAppPortal();
  });
});
