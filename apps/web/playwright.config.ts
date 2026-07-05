import { defineConfig } from "@playwright/test";

const nodeProcess = globalThis["process"] as
  | { env?: Record<string, string | undefined> }
  | undefined;
const nodeEnv = nodeProcess?.["env"] ?? {};
const chromiumExecutablePath = nodeEnv["CHROMIUM_EXECUTABLE_PATH"];
const useFakeMedia = nodeEnv["PLAYWRIGHT_USE_FAKE_MEDIA"] === "true";
const launchArgs = useFakeMedia
  ? [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ]
  : [];

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  fullyParallel: false,
  reporter: "line",
  use: {
    headless: nodeEnv["PLAYWRIGHT_HEADLESS"] !== "false",
    permissions: useFakeMedia ? ["microphone"] : [],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    launchOptions: chromiumExecutablePath || launchArgs.length > 0
      ? {
          args: launchArgs,
          executablePath: chromiumExecutablePath,
        }
      : undefined,
  },
});
