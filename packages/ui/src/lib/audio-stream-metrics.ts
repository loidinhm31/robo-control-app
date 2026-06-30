import type { NormalizedAudioFrame } from "./audio-frame";
import type { AudioTimelineDropReason } from "./audio-timeline-scheduler";

export type LongTaskObserverStatus = "disabled" | "observing" | "unsupported";

export interface MetricDistribution {
  samples: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
}

export interface AudioStreamMetricsSnapshot {
  capturedAtMs: number;
  streamId: string | null;
  framesReceived: number;
  invalidFrames: number;
  decoderDrops: number;
  sequenceGaps: number;
  duplicates: number;
  regressions: number;
  streamResets: number;
  futureTimestamps: number;
  underruns: number;
  timelineResets: number;
  scheduledFrames: number;
  scheduleDrops: number;
  duplicateDrops: number;
  regressionDrops: number;
  tooOldDrops: number;
  horizonDrops: number;
  suspendedDrops: number;
  invalidScheduleDrops: number;
  sourceErrors: number;
  longTasks: number;
  longTaskDurationMs: number;
  longTaskObserver: LongTaskObserverStatus;
  queueDepth: number;
  queueDurationMs: number;
  interArrivalMs: MetricDistribution;
  ageMs: MetricDistribution;
  scheduledHorizonMs: MetricDistribution;
}

class BoundedSamples {
  private readonly values: number[] = [];

  constructor(private readonly capacity: number) {}

  add(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    if (this.values.length === this.capacity) this.values.shift();
    this.values.push(value);
  }

  snapshot(): MetricDistribution {
    if (this.values.length === 0) return { samples: 0, p50: null, p95: null, max: null };
    const sorted = [...this.values].sort((left, right) => left - right);
    const percentile = (ratio: number): number => sorted[Math.ceil(ratio * sorted.length) - 1] ?? 0;
    return {
      samples: sorted.length,
      p50: percentile(0.5),
      p95: percentile(0.95),
      max: sorted[sorted.length - 1] ?? null,
    };
  }

  clear(): void {
    this.values.length = 0;
  }
}

export class AudioStreamMetrics {
  private interArrival: BoundedSamples;
  private age: BoundedSamples;
  private horizon: BoundedSamples;
  private lastArrivalMs: number | null = null;
  private sequenceKey: string | null = null;
  private lastFrameId: number | null = null;
  private streamId: string | null = null;
  private observerStatus: LongTaskObserverStatus = "disabled";
  private queueDepth = 0;
  private queueDurationMs = 0;
  private counters = this.emptyCounters();

  constructor(capacity = 256) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("capacity must be positive");
    this.interArrival = new BoundedSamples(capacity);
    this.age = new BoundedSamples(capacity);
    this.horizon = new BoundedSamples(capacity);
  }

  recordFrame(frame: NormalizedAudioFrame, arrivalMs: number, wallClockMs: number): void {
    this.counters.framesReceived++;
    if (this.lastArrivalMs !== null) this.interArrival.add(arrivalMs - this.lastArrivalMs);
    this.lastArrivalMs = arrivalMs;

    const ageMs = wallClockMs - frame.captureTimestampMs;
    if (ageMs >= 0) this.age.add(ageMs);
    else this.counters.futureTimestamps++;

    const key = `${frame.entityId ?? ""}:${frame.streamId ?? "legacy"}`;
    if (key !== this.sequenceKey) {
      if (this.sequenceKey !== null) this.counters.streamResets++;
      this.sequenceKey = key;
      this.streamId = frame.streamId ?? null;
      this.lastFrameId = frame.frameId;
      return;
    }
    if (this.lastFrameId === null) {
      this.lastFrameId = frame.frameId;
    } else if (frame.frameId === this.lastFrameId) {
      this.counters.duplicates++;
    } else if (frame.frameId < this.lastFrameId) {
      this.counters.regressions++;
    } else {
      this.counters.sequenceGaps += Math.max(0, frame.frameId - this.lastFrameId - 1);
      this.lastFrameId = frame.frameId;
    }
  }

  recordInvalidFrame(): void { this.counters.invalidFrames++; }
  recordDecoderDrop(): void { this.counters.decoderDrops++; }
  recordUnderrun(): void { this.counters.underruns++; }
  recordTimelineReset(): void { this.counters.timelineResets++; }
  recordScheduledFrame(): void { this.counters.scheduledFrames++; }

  recordSchedulerDrop(reason: AudioTimelineDropReason): void {
    this.counters.scheduleDrops++;
    const counterByReason: Record<AudioTimelineDropReason, keyof typeof this.counters> = {
      duplicate: "duplicateDrops",
      regression: "regressionDrops",
      "too-old": "tooOldDrops",
      "horizon-overflow": "horizonDrops",
      suspended: "suspendedDrops",
      invalid: "invalidScheduleDrops",
      "source-error": "sourceErrors",
    };
    this.counters[counterByReason[reason]]++;
  }

  recordLongTask(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    this.counters.longTasks++;
    this.counters.longTaskDurationMs += durationMs;
  }

  recordPlayback(queueDepth: number, queueDurationMs: number, scheduledHorizonMs: number): void {
    this.queueDepth = Math.max(0, queueDepth);
    this.queueDurationMs = Math.max(0, queueDurationMs);
    this.horizon.add(Math.max(0, scheduledHorizonMs));
  }

  setLongTaskObserver(status: LongTaskObserverStatus): void { this.observerStatus = status; }

  snapshot(capturedAtMs = Date.now()): AudioStreamMetricsSnapshot {
    return {
      capturedAtMs,
      streamId: this.streamId,
      ...this.counters,
      longTaskObserver: this.observerStatus,
      queueDepth: this.queueDepth,
      queueDurationMs: this.queueDurationMs,
      interArrivalMs: this.interArrival.snapshot(),
      ageMs: this.age.snapshot(),
      scheduledHorizonMs: this.horizon.snapshot(),
    };
  }

  reset(): void {
    this.interArrival.clear();
    this.age.clear();
    this.horizon.clear();
    this.lastArrivalMs = null;
    this.sequenceKey = null;
    this.lastFrameId = null;
    this.streamId = null;
    this.queueDepth = 0;
    this.queueDurationMs = 0;
    this.counters = this.emptyCounters();
  }

  private emptyCounters() {
    return { framesReceived: 0, invalidFrames: 0, decoderDrops: 0,
      sequenceGaps: 0, duplicates: 0,
      regressions: 0, streamResets: 0, futureTimestamps: 0, underruns: 0,
      timelineResets: 0, scheduledFrames: 0, scheduleDrops: 0,
      duplicateDrops: 0, regressionDrops: 0, tooOldDrops: 0,
      horizonDrops: 0, suspendedDrops: 0, invalidScheduleDrops: 0,
      sourceErrors: 0,
      longTasks: 0, longTaskDurationMs: 0 };
  }
}
