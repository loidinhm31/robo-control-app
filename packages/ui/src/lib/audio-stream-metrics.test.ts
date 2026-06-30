import { describe, expect, it } from "vitest";
import type { NormalizedAudioFrame } from "./audio-frame";
import { AudioStreamMetrics } from "./audio-stream-metrics";

const frame = (frameId: number, streamId = "550e8400-e29b-41d4-a716-446655440000"):
  NormalizedAudioFrame => ({
  streamId,
  entityId: "rover-kiwi",
  frameId,
  captureTimestampMs: 1_000,
  sampleRate: 16_000,
  channels: 1,
  sampleCount: 2,
  durationMs: 0.125,
  pcmBytes: new Uint8Array(4),
});

describe("AudioStreamMetrics", () => {
  it("uses fixed-capacity percentile windows", () => {
    const metrics = new AudioStreamMetrics(2);
    metrics.recordFrame(frame(0), 0, 1_010);
    metrics.recordFrame(frame(1), 10, 1_020);
    metrics.recordFrame(frame(2), 30, 1_030);

    expect(metrics.snapshot().interArrivalMs).toEqual({
      samples: 2,
      p50: 10,
      p95: 20,
      max: 20,
    });
  });

  it("counts sequence gaps, duplicates, regressions, and stream resets", () => {
    const metrics = new AudioStreamMetrics();
    metrics.recordFrame(frame(10), 0, 1_000);
    metrics.recordFrame(frame(12), 50, 1_050);
    metrics.recordFrame(frame(12), 100, 1_100);
    metrics.recordFrame(frame(11), 150, 1_150);
    metrics.recordFrame(frame(0, "123e4567-e89b-42d3-a456-426614174000"), 200, 1_200);

    const snapshot = metrics.snapshot();
    expect(snapshot.sequenceGaps).toBe(1);
    expect(snapshot.duplicates).toBe(1);
    expect(snapshot.regressions).toBe(1);
    expect(snapshot.streamResets).toBe(1);
  });

  it("records playback, decoder drops, underrun, long-task, and future-clock evidence", () => {
    const metrics = new AudioStreamMetrics();
    metrics.recordFrame(frame(0), 0, 900);
    metrics.recordPlayback(3, 150, 75);
    metrics.recordDecoderDrop();
    metrics.recordUnderrun();
    metrics.recordTimelineReset();
    metrics.recordScheduledFrame();
    metrics.recordSchedulerDrop("horizon-overflow");
    metrics.recordSchedulerDrop("too-old");
    metrics.recordSchedulerDrop("source-error");
    metrics.recordLongTask(55);
    metrics.setLongTaskObserver("observing");

    const snapshot = metrics.snapshot();
    expect(snapshot.futureTimestamps).toBe(1);
    expect(snapshot.queueDepth).toBe(3);
    expect(snapshot.queueDurationMs).toBe(150);
    expect(snapshot.scheduledHorizonMs.p95).toBe(75);
    expect(snapshot.underruns).toBe(1);
    expect(snapshot.timelineResets).toBe(1);
    expect(snapshot.scheduledFrames).toBe(1);
    expect(snapshot.scheduleDrops).toBe(3);
    expect(snapshot.horizonDrops).toBe(1);
    expect(snapshot.tooOldDrops).toBe(1);
    expect(snapshot.sourceErrors).toBe(1);
    expect(snapshot.decoderDrops).toBe(1);
    expect(snapshot.longTasks).toBe(1);
    expect(snapshot.longTaskDurationMs).toBe(55);
    expect(snapshot.longTaskObserver).toBe("observing");
  });

  it("resets bounded samples and counters", () => {
    const metrics = new AudioStreamMetrics();
    metrics.recordFrame(frame(0), 0, 1_010);
    metrics.recordInvalidFrame();
    metrics.reset();

    const snapshot = metrics.snapshot();
    expect(snapshot.framesReceived).toBe(0);
    expect(snapshot.invalidFrames).toBe(0);
    expect(snapshot.decoderDrops).toBe(0);
    expect(snapshot.ageMs.samples).toBe(0);
    expect(snapshot.streamId).toBeNull();
  });
});
