import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  expectPressed,
  openLiveApp,
  openVoicePanel,
  seedLiveAuth,
} from "./helpers/live-session";

type VoiceUi = Awaited<ReturnType<typeof voiceLocators>>;

interface VoiceConfigTarget {
  language: "en" | "vi";
  speaker: "m1" | "f2";
  quality: "balanced" | "fast";
  speed: string;
  volume: string;
}

const DEFAULT_CONFIG: VoiceConfigTarget = {
  language: "en",
  speaker: "m1",
  quality: "balanced",
  speed: "1",
  volume: "0.8",
};

const ALT_CONFIG: VoiceConfigTarget = {
  language: "vi",
  speaker: "f2",
  quality: "fast",
  speed: "1.25",
  volume: "0.65",
};

const LONG_TTS_TEXT = [
  "This is a long live preemption phrase for the browser suite.",
  "Keep speaking while the browser voice command control starts and stops.",
  "Continue playback long enough for the fake-media walkie talkie to interrupt rover speech with an authoritative result.",
  "The rover should remain in an active speaking state until the walkie path takes priority.",
].join(" ");

async function voiceLocators(page: Page) {
  return {
    summary: page.getByTestId("voice-config-summary"),
    desiredRevision: page.getByTestId("voice-config-desired-revision"),
    appliedRevision: page.getByTestId("voice-config-applied-revision"),
    languageEnglish: page.getByTestId("language-english"),
    languageVietnamese: page.getByTestId("language-vietnamese"),
    voiceM1: page.getByTestId("speaker-m1"),
    voiceF2: page.getByTestId("speaker-f2"),
    qualityBalanced: page.getByTestId("quality-preset-balanced"),
    qualityFast: page.getByTestId("quality-preset-fast"),
    speed: page.getByTestId("tts-speed-slider"),
    volume: page.getByTestId("tts-volume-slider"),
    speakInput: page.getByTestId("tts-text-input"),
    speakButton: page.getByTestId("tts-submit-button"),
    ttsDisabledReason: page.getByTestId("tts-disabled-reason"),
    walkieToggle: page.getByTestId("walkie-toggle"),
    browserVoiceToggle: page.getByTestId("voice-command-toggle"),
  };
}

async function openVoice(page: Page) {
  await openLiveApp(page);
  await openVoicePanel(page);
  await expect(page.getByTestId("voice-config-desired-revision")).toContainText("Desired R", {
    timeout: 60_000,
  });
  await expect(page.getByTestId("voice-config-applied-revision")).toHaveText("Applied 1/1", {
    timeout: 10_000,
  });
}

async function setSlider(locator: Locator, value: string) {
  await locator.fill(value);
  await locator.dispatchEvent("input");
  await locator.dispatchEvent("change");
}

async function isPressed(locator: Locator): Promise<boolean> {
  return (await locator.getAttribute("aria-pressed")) === "true";
}

async function currentRevisionBadgeText(page: Page): Promise<string> {
  const pendingRevision = page.getByTestId("voice-config-pending-revision");
  if (await pendingRevision.count()) {
    return ((await pendingRevision.textContent()) ?? "").trim();
  }
  return ((await page.getByTestId("voice-config-desired-revision").textContent()) ?? "").trim();
}

async function assertVoiceConfig(ui: VoiceUi, target: VoiceConfigTarget): Promise<void> {
  if (target.language === "en") {
    await expectPressed(ui.languageEnglish);
  } else {
    await expectPressed(ui.languageVietnamese);
  }

  if (target.speaker === "m1") {
    await expectPressed(ui.voiceM1);
  } else {
    await expectPressed(ui.voiceF2);
  }

  if (target.quality === "balanced") {
    await expectPressed(ui.qualityBalanced);
  } else {
    await expectPressed(ui.qualityFast);
  }

  await expect(ui.speed).toHaveValue(target.speed);
  await expect(ui.volume).toHaveValue(target.volume);
}

async function isVoiceConfig(ui: VoiceUi, target: VoiceConfigTarget): Promise<boolean> {
  const languageMatches = target.language === "en"
    ? await isPressed(ui.languageEnglish)
    : await isPressed(ui.languageVietnamese);
  const speakerMatches = target.speaker === "m1"
    ? await isPressed(ui.voiceM1)
    : await isPressed(ui.voiceF2);
  const qualityMatches = target.quality === "balanced"
    ? await isPressed(ui.qualityBalanced)
    : await isPressed(ui.qualityFast);
  const speedMatches = (await ui.speed.inputValue()) === target.speed;
  const volumeMatches = (await ui.volume.inputValue()) === target.volume;
  return languageMatches && speakerMatches && qualityMatches && speedMatches && volumeMatches;
}

async function ensureVoiceConfig(
  page: Page,
  ui: VoiceUi,
  target: VoiceConfigTarget,
): Promise<void> {
  if (await isVoiceConfig(ui, target)) {
    await assertVoiceConfig(ui, target);
    return;
  }

  const beforeRevision = await currentRevisionBadgeText(page);

  if (target.language === "en") {
    if (!await isPressed(ui.languageEnglish)) {
      await ui.languageEnglish.click();
    }
  } else if (!await isPressed(ui.languageVietnamese)) {
    await ui.languageVietnamese.click();
  }

  if (target.speaker === "m1") {
    if (!await isPressed(ui.voiceM1)) {
      await ui.voiceM1.click();
    }
  } else if (!await isPressed(ui.voiceF2)) {
    await ui.voiceF2.click();
  }

  if (target.quality === "balanced") {
    if (!await isPressed(ui.qualityBalanced)) {
      await ui.qualityBalanced.click();
    }
  } else if (!await isPressed(ui.qualityFast)) {
    await ui.qualityFast.click();
  }

  if ((await ui.speed.inputValue()) !== target.speed) {
    await setSlider(ui.speed, target.speed);
  }
  if ((await ui.volume.inputValue()) !== target.volume) {
    await setSlider(ui.volume, target.volume);
  }

  await expect.poll(async () => await currentRevisionBadgeText(page), {
    timeout: 30_000,
  }).not.toBe(beforeRevision);
  await expect(ui.appliedRevision).toHaveText("Applied 1/1", { timeout: 30_000 });
  await assertVoiceConfig(ui, target);
}

test.describe("edge voice live @edge-voice-live", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await seedLiveAuth(page);
  });

  test("defaults, convergence, lifecycle, reconnect, and browser STT stay live", async ({ page }) => {
    await openVoice(page);
    const ui = await voiceLocators(page);

    await ensureVoiceConfig(page, ui, DEFAULT_CONFIG);
    await ensureVoiceConfig(page, ui, ALT_CONFIG);

    await ui.speakInput.fill(
      "Live browser suite short utterance. Confirm rover speech enters speaking and returns ready.",
    );
    await ui.speakButton.click();
    await expect(ui.summary).toContainText("SPEAKING", { timeout: 15_000 });
    await expect(ui.summary).toContainText("READY", { timeout: 30_000 });

    await ui.speakInput.fill(LONG_TTS_TEXT);
    await ui.speakButton.click();
    await expect(ui.summary).toContainText("SPEAKING", { timeout: 15_000 });

    await expect(ui.browserVoiceToggle).toBeEnabled();
    await ui.browserVoiceToggle.click();
    await expect(ui.browserVoiceToggle).toContainText("Stop", { timeout: 15_000 });
    await ui.browserVoiceToggle.click();
    await expect(ui.browserVoiceToggle).toContainText("Start", { timeout: 15_000 });

    await ui.walkieToggle.click();
    const interruptionAlert = page.getByRole("alert").filter({
      hasText: "Walkie-talkie took priority",
    });
    await expect(interruptionAlert).toContainText("interrupted rover speech", { timeout: 20_000 });
    await expect(ui.speakInput).toBeDisabled();
    await expect(ui.ttsDisabledReason).toContainText("Live walkie-talkie has priority");
    await ui.walkieToggle.click();
    await expect(ui.speakInput).toBeEnabled({ timeout: 15_000 });
    await expect(ui.summary).toContainText("READY", { timeout: 30_000 });

    const desiredBeforeReconnect = await ui.desiredRevision.textContent();
    await page.getByTestId("server-settings-trigger").click();
    await page.getByTestId("server-settings-disconnect").click();
    await expect(page.getByText("[OFFLINE]")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Waiting for the server to publish the authoritative TTS configuration."))
      .toBeVisible({ timeout: 15_000 });

    await page.getByTestId("server-settings-trigger").click();
    await page.getByTestId("server-settings-connect").click();
    await expect(page.getByText("[ONLINE]")).toBeVisible({ timeout: 30_000 });
    await openVoicePanel(page);
    await expect(ui.desiredRevision).toHaveText(desiredBeforeReconnect ?? "", { timeout: 30_000 });
    await expect(ui.appliedRevision).toHaveText("Applied 1/1", { timeout: 10_000 });
    await assertVoiceConfig(ui, ALT_CONFIG);
    await expect(ui.summary).toContainText("READY");

    await expect(desiredBeforeReconnect).not.toBeNull();
    await ensureVoiceConfig(page, ui, DEFAULT_CONFIG);
  });
});
