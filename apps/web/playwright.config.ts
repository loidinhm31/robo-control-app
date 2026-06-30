import { defineConfig } from "@playwright/test";

const nodeProcess = globalThis["process"] as
  | { env?: Record<string, string | undefined> }
  | undefined;
const nodeEnv = nodeProcess?.["env"] ?? {};
const chromiumExecutablePath = nodeEnv["CHROMIUM_EXECUTABLE_PATH"];

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  fullyParallel: false,
  reporter: "line",
  use: {
    headless: nodeEnv["PLAYWRIGHT_HEADLESS"] !== "false",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    launchOptions: chromiumExecutablePath
      ? { executablePath: chromiumExecutablePath }
      : undefined,
  },
});
