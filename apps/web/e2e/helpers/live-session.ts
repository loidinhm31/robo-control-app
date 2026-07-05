import { expect, type Locator, type Page } from "@playwright/test";

const nodeProcess = globalThis["process"] as
  | { env?: Record<string, string | undefined> }
  | undefined;
const nodeEnv = nodeProcess?.["env"] ?? {};

export const APP_URL =
  nodeEnv["STREAM_E2E_APP_URL"] ?? "http://127.0.0.1:25010/?audioDebug=1";
export const SOCKET_URL = nodeEnv["STREAM_E2E_SOCKET_URL"] ?? "http://127.0.0.1:3030";
export const USERNAME = nodeEnv["STREAM_E2E_USERNAME"] ?? "admin";
export const PASSWORD = nodeEnv["STREAM_E2E_PASSWORD"] ?? "password";

export async function seedLiveAuth(page: Page): Promise<void> {
  await page.addInitScript(
    ({ socketUrl, username, password }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem("robo-fleet-server-url", socketUrl);
      localStorage.setItem("robo-fleet-auth", JSON.stringify({ username, password }));
    },
    {
      socketUrl: SOCKET_URL,
      username: USERNAME,
      password: PASSWORD,
    },
  );
}

export async function openLiveApp(page: Page): Promise<void> {
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await expect(page.getByText("[ONLINE]")).toBeVisible({ timeout: 60_000 });
}

export async function openVoicePanel(page: Page): Promise<void> {
  const trigger = page.getByTestId("voice-panel-toggle");
  if (await trigger.isVisible()) {
    await trigger.evaluate((node) => {
      if (node.parentElement instanceof HTMLElement) {
        node.parentElement.click();
        return;
      }
      if (node instanceof HTMLElement) {
        node.click();
      }
    });
  }
  await expect(page.getByText("VOICE CONTROL")).toBeVisible({ timeout: 30_000 });
}

export async function expectPressed(locator: Locator): Promise<void> {
  await expect(locator).toHaveAttribute("aria-pressed", "true");
}
