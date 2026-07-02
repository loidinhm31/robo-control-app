import { describe, expect, it } from "vitest";
import {
  AudioTimelineScheduler,
  type AudioTimelineBuffer,
  type AudioTimelineSource,
} from "./audio-timeline-scheduler";

class FakeSource implements AudioTimelineSource {
  callback: (() => void) | null = null;
  startTime: number | null = null;
  stopCount = 0;
  disposeCount = 0;

  constructor(private readonly failStart = false) {}

  start(whenSeconds: number): void {
    if (this.failStart) throw new Error("start failed");
    this.startTime = whenSeconds;
  }

  stop(): void { this.stopCount++; }
  dispose(): void { this.disposeCount++; }
  setOnEnded(callback: (() => void) | null): void { this.callback = callback; }
  end(): void { this.callback?.(); }
}

const frame = (frameId: number, streamId = "stream-a", ageMs = 20) => ({
  streamId,
  frameId,
  ageMs,
  buffer: { duration: 0.05 } satisfies AudioTimelineBuffer,
});

const setup = (failStart = false) => {
  let now = 0;
  const sources: FakeSource[] = [];
  const scheduler = new AudioTimelineScheduler<AudioTimelineBuffer>({
    now: () => now,
    createSource: () => {
      const source = new FakeSource(failStart);
      sources.push(source);
      return source;
    },
  });
  return { scheduler, sources, setNow: (value: number) => { now = value; } };
};

describe("AudioTimelineScheduler", () => {
  it("keeps ideal 20 Hz input continuous and below the maximum horizon", () => {
    const { scheduler, sources, setNow } = setup();
    const horizons: number[] = [];

    for (let id = 0; id < 20; id++) {
      setNow(id * 0.05);
      if (id > 1) sources[id - 2]?.end();
      const result = scheduler.push(frame(id));
      expect(result.status).toBe("scheduled");
      expect(result.underrun).toBe(false);
      horizons.push(result.horizonMs);
    }

    expect(Math.max(...horizons)).toBeLessThanOrEqual(100.000_001);
    expect(scheduler.activeSourceCount).toBeLessThanOrEqual(2);
  });

  it("keeps jittered ten-minute input bounded without source growth", () => {
    const { scheduler, sources, setNow } = setup();
    let maximumSources = 0;

    for (let id = 0; id < 12_000; id++) {
      const jitterSeconds = ((id % 5) - 2) * 0.002;
      setNow(Math.max(0, id * 0.05 + jitterSeconds));
      if (id > 1) sources[id - 2]?.end();
      const result = scheduler.push(frame(id));
      expect(result.status).toBe("scheduled");
      expect(result.underrun).toBe(false);
      expect(result.timelineReset).toBe(id === 0);
      expect(result.horizonMs).toBeLessThanOrEqual(110);
      maximumSources = Math.max(maximumSources, result.activeSources);
    }

    expect(maximumSources).toBeLessThanOrEqual(2);
  });

  it("resets timeline instead of dropping burst frames beyond the 150 ms horizon", () => {
    const { scheduler, sources, setNow } = setup();
    setNow(10);
    expect(scheduler.push(frame(0)).status).toBe("scheduled");
    expect(scheduler.push(frame(1)).status).toBe("scheduled");
    // 3rd frame overflows 150ms horizon — scheduler resets to target lead
    // and schedules it instead of dropping (prevents death-spiral).
    const result = scheduler.push(frame(2));
    expect(result).toMatchObject({
      status: "scheduled",
      timelineReset: true,
      activeSources: 1,
    });
    expect(sources[0]?.stopCount).toBe(1);
    expect(sources[1]?.stopCount).toBe(1);
  });

  it("prevents horizon-overflow death-spiral after timeline reset", () => {
    const { scheduler, setNow } = setup();
    setNow(10);
    scheduler.push(frame(0));
    scheduler.push(frame(1));
    // 3rd frame overflows → resets and schedules (not drops).
    expect(scheduler.push(frame(2)).status).toBe("scheduled");
    // Advance time by one frame. Next frame schedules normally — no death-spiral.
    setNow(10.05);
    expect(scheduler.push(frame(3)).status).toBe("scheduled");
  });

  it("restarts at target lead after a one-second scheduling stall", () => {
    const { scheduler, sources, setNow } = setup();
    scheduler.push(frame(0));
    setNow(1);
    const result = scheduler.push(frame(1));

    expect(result).toMatchObject({
      status: "scheduled",
      startTimeSeconds: 1.05,
      timelineReset: true,
      underrun: true,
      activeSources: 1,
    });
    expect(sources[0]?.stopCount).toBe(1);
  });

  it("drops duplicate, regressed, stale, and invalid frames", () => {
    const { scheduler } = setup();
    scheduler.push(frame(10));
    expect(scheduler.push(frame(10)).reason).toBe("duplicate");
    expect(scheduler.push(frame(9)).reason).toBe("regression");
    expect(scheduler.push(frame(11, "stream-a", 1_001)).reason).toBe("too-old");
    expect(scheduler.push({ ...frame(12), buffer: { duration: 0 } }).reason).toBe("invalid");
  });

  it("resets sequence and cancels sources when the stream changes", () => {
    const { scheduler, sources } = setup();
    scheduler.push(frame(20));
    const result = scheduler.push(frame(0, "stream-b"));

    expect(result).toMatchObject({ status: "scheduled", timelineReset: true, activeSources: 1 });
    expect(sources[0]?.stopCount).toBe(1);
    expect(sources[0]?.disposeCount).toBe(1);
  });

  it("removes ended sources and makes suspend, reset, and dispose idempotent", () => {
    const { scheduler, sources } = setup();
    scheduler.push(frame(0));
    sources[0]?.end();
    expect(scheduler.activeSourceCount).toBe(0);

    scheduler.push(frame(1));
    scheduler.suspend();
    scheduler.suspend();
    expect(scheduler.activeSourceCount).toBe(0);
    expect(scheduler.push(frame(2)).reason).toBe("suspended");

    scheduler.resume();
    expect(scheduler.push(frame(0, "stream-b")).status).toBe("scheduled");
    scheduler.reset();
    scheduler.reset();
    scheduler.dispose();
    scheduler.dispose();
    expect(scheduler.activeSourceCount).toBe(0);
    expect(scheduler.push(frame(1, "stream-b")).reason).toBe("suspended");
  });

  it("releases source ownership when Web Audio start fails", () => {
    const { scheduler, sources } = setup(true);
    expect(scheduler.push(frame(0))).toMatchObject({
      status: "dropped",
      reason: "source-error",
      activeSources: 0,
    });
    expect(sources[0]?.disposeCount).toBe(1);
  });
});
