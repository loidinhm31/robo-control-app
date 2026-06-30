import { describe, expect, it } from "vitest";

import {
  shouldResetVideoStats,
  VIDEO_STREAM_IDLE_RESET_MS,
} from "./video-stream-state";

describe("shouldResetVideoStats", () => {
  it("resets when the stream is disabled", () => {
    expect(
      shouldResetVideoStats({
        streamEnabled: false,
        cameraEnabled: true,
        lastFrameAtMs: Date.now(),
        nowMs: Date.now(),
      }),
    ).toBe(true);
  });

  it("resets when the camera is disabled", () => {
    expect(
      shouldResetVideoStats({
        streamEnabled: true,
        cameraEnabled: false,
        lastFrameAtMs: Date.now(),
        nowMs: Date.now(),
      }),
    ).toBe(true);
  });

  it("resets when no frame has ever arrived", () => {
    expect(
      shouldResetVideoStats({
        streamEnabled: true,
        cameraEnabled: true,
        lastFrameAtMs: null,
        nowMs: Date.now(),
      }),
    ).toBe(true);
  });

  it("keeps stats live while frames are recent", () => {
    expect(
      shouldResetVideoStats({
        streamEnabled: true,
        cameraEnabled: true,
        lastFrameAtMs: 1_000,
        nowMs: 1_000 + VIDEO_STREAM_IDLE_RESET_MS - 1,
      }),
    ).toBe(false);
  });

  it("resets after the idle window elapses", () => {
    expect(
      shouldResetVideoStats({
        streamEnabled: true,
        cameraEnabled: true,
        lastFrameAtMs: 1_000,
        nowMs: 1_000 + VIDEO_STREAM_IDLE_RESET_MS,
      }),
    ).toBe(true);
  });
});
