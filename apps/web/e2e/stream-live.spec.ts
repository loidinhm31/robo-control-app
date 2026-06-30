import { expect, test, type Locator, type Page } from "@playwright/test";

const nodeProcess = globalThis["process"] as
  | { env?: Record<string, string | undefined> }
  | undefined;
const nodeEnv = nodeProcess?.["env"] ?? {};

const APP_URL = nodeEnv["STREAM_E2E_APP_URL"] ?? "http://127.0.0.1:5173/?audioDebug=1";
const SOCKET_URL = nodeEnv["STREAM_E2E_SOCKET_URL"] ?? "http://127.0.0.1:3030";
const USERNAME = nodeEnv["STREAM_E2E_USERNAME"] ?? "admin";
const PASSWORD = nodeEnv["STREAM_E2E_PASSWORD"] ?? "password";

async function seedAuth(page: Page) {
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

async function openLiveCamera(page: Page) {
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await expect(page.getByText("[ONLINE]")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("camera-feed-open").click();
  await expect(page.getByTestId("camera-stream-toggle")).toBeVisible({ timeout: 30_000 });
}

async function startStream(page: Page) {
  await page.getByTestId("camera-stream-toggle").click();
  await expect(page.getByTestId("stream-stats-panel")).toBeVisible({ timeout: 30_000 });
}

async function readMetric(locator: Locator) {
  const text = (await locator.textContent()) ?? "";
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    throw new Error(`failed to parse metric from "${text}"`);
  }

  return Number(match[0]);
}

async function waitForMetricAbove(locator: Locator, minimum: number, timeout = 60_000) {
  await expect
    .poll(() => readMetric(locator), { timeout, message: `expected metric > ${minimum}` })
    .toBeGreaterThan(minimum);
}

async function ensureVideoFlow(page: Page) {
  const videoFps = page.getByTestId("camera-video-fps");
  const videoBitrate = page.getByTestId("camera-video-bitrate");

  try {
    await waitForMetricAbove(videoFps, 0, 15_000);
    await waitForMetricAbove(videoBitrate, 0, 15_000);
    return;
  } catch {
    await page.getByTestId("camera-power-toggle").click();
    await page.waitForTimeout(1_500);
    await page.getByTestId("camera-power-toggle").click();
    await page.waitForTimeout(1_500);
  }

  await waitForMetricAbove(videoFps, 0, 45_000);
  await waitForMetricAbove(videoBitrate, 0, 45_000);
}

async function waitForStableZero(locator: Locator, stableMs = 3_000, timeout = 15_000) {
  const startedAt = Date.now();
  let zeroSince: number | null = null;

  while (Date.now() - startedAt < timeout) {
    const value = await readMetric(locator);

    if (value === 0) {
      zeroSince ??= Date.now();
      if (Date.now() - zeroSince >= stableMs) {
        return;
      }
    } else {
      zeroSince = null;
    }

    await locator.page().waitForTimeout(250);
  }

  throw new Error(`metric did not remain at zero for ${stableMs}ms within ${timeout}ms`);
}

test.describe("live stream controls @live", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
  });

  test("audio + video stream reaches live stats", async ({ page }) => {
    await openLiveCamera(page);
    await startStream(page);

    await waitForMetricAbove(page.getByTestId("camera-audio-frames"), 0);
    await ensureVideoFlow(page);
  });

  test("camera off drives video stats to zero while audio keeps moving", async ({ page }) => {
    await openLiveCamera(page);
    await startStream(page);

    const audioFrames = page.getByTestId("camera-audio-frames");
    const videoFps = page.getByTestId("camera-video-fps");
    const videoBitrate = page.getByTestId("camera-video-bitrate");

    await waitForMetricAbove(audioFrames, 0);
    await ensureVideoFlow(page);

    const audioFramesBeforeCameraOff = await readMetric(audioFrames);
    await page.getByTestId("camera-power-toggle").click();

    await waitForStableZero(videoFps);
    await waitForStableZero(videoBitrate);

    await expect
      .poll(() => readMetric(audioFrames), {
        timeout: 10_000,
        message: "expected audio frames to continue increasing after camera off",
      })
      .toBeGreaterThan(audioFramesBeforeCameraOff);
  });
});
