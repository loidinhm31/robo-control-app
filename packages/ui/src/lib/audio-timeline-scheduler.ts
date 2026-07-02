export const AUDIO_TIMELINE_DEFAULTS = {
  minimumLeadSeconds: 0.01,
  targetLeadSeconds: 0.05,
  maximumHorizonSeconds: 0.15,
  maximumFrameAgeMs: 1_000,
} as const;

const HORIZON_EPSILON_SECONDS = 1e-9;

export interface AudioTimelineBuffer {
  duration: number;
}

export interface AudioTimelineSource {
  start(whenSeconds: number): void;
  stop(): void;
  dispose(): void;
  setOnEnded(callback: (() => void) | null): void;
}

export type AudioTimelineDropReason =
  | "duplicate"
  | "regression"
  | "too-old"
  | "horizon-overflow"
  | "suspended"
  | "invalid"
  | "source-error";

export interface AudioTimelineFrame<TBuffer extends AudioTimelineBuffer> {
  streamId: string;
  frameId: number;
  ageMs: number;
  buffer: TBuffer;
}

export interface AudioTimelinePushResult {
  status: "scheduled" | "dropped";
  reason?: AudioTimelineDropReason;
  startTimeSeconds?: number;
  endTimeSeconds?: number;
  horizonMs: number;
  activeSources: number;
  timelineReset: boolean;
  underrun: boolean;
}

export interface AudioTimelineSchedulerOptions<TBuffer extends AudioTimelineBuffer> {
  now: () => number;
  createSource: (buffer: TBuffer) => AudioTimelineSource;
  minimumLeadSeconds?: number;
  targetLeadSeconds?: number;
  maximumHorizonSeconds?: number;
  maximumFrameAgeMs?: number;
}

export class AudioTimelineScheduler<TBuffer extends AudioTimelineBuffer> {
  private readonly sources = new Set<AudioTimelineSource>();
  private readonly minimumLeadSeconds: number;
  private readonly targetLeadSeconds: number;
  private readonly maximumHorizonSeconds: number;
  private readonly maximumFrameAgeMs: number;
  private streamId: string | null = null;
  private lastFrameId: number | null = null;
  private nextEndSeconds: number | null = null;
  private suspended = false;
  private disposed = false;

  constructor(private readonly options: AudioTimelineSchedulerOptions<TBuffer>) {
    this.minimumLeadSeconds = options.minimumLeadSeconds ?? AUDIO_TIMELINE_DEFAULTS.minimumLeadSeconds;
    this.targetLeadSeconds = options.targetLeadSeconds ?? AUDIO_TIMELINE_DEFAULTS.targetLeadSeconds;
    this.maximumHorizonSeconds = options.maximumHorizonSeconds ?? AUDIO_TIMELINE_DEFAULTS.maximumHorizonSeconds;
    this.maximumFrameAgeMs = options.maximumFrameAgeMs ?? AUDIO_TIMELINE_DEFAULTS.maximumFrameAgeMs;
    if (
      this.minimumLeadSeconds < 0 ||
      this.targetLeadSeconds < this.minimumLeadSeconds ||
      this.maximumHorizonSeconds < this.targetLeadSeconds ||
      this.maximumFrameAgeMs < 0
    ) {
      throw new Error("invalid audio timeline scheduler bounds");
    }
  }

  push(frame: AudioTimelineFrame<TBuffer>): AudioTimelinePushResult {
    const now = this.options.now();
    if (this.disposed || this.suspended) return this.dropped("suspended", now, false);

    let timelineReset = false;
    if (frame.streamId !== this.streamId) {
      this.clearSources();
      this.streamId = frame.streamId;
      this.lastFrameId = null;
      this.nextEndSeconds = null;
      timelineReset = true;
    }

    if (this.lastFrameId !== null && frame.frameId === this.lastFrameId) {
      return this.dropped("duplicate", now, timelineReset);
    }
    if (this.lastFrameId !== null && frame.frameId < this.lastFrameId) {
      return this.dropped("regression", now, timelineReset);
    }
    this.lastFrameId = frame.frameId;

    if (!Number.isFinite(frame.ageMs) || frame.ageMs > this.maximumFrameAgeMs) {
      return this.dropped("too-old", now, timelineReset);
    }
    if (!Number.isFinite(frame.buffer.duration) || frame.buffer.duration <= 0) {
      return this.dropped("invalid", now, timelineReset);
    }

    let underrun = false;
    let startTime = this.nextEndSeconds ?? now + this.targetLeadSeconds;
    if (this.nextEndSeconds !== null && startTime - now < this.minimumLeadSeconds) {
      this.clearSources();
      startTime = now + this.targetLeadSeconds;
      timelineReset = true;
      underrun = true;
    }
    let endTime = startTime + frame.buffer.duration;
    if (endTime - now > this.maximumHorizonSeconds + HORIZON_EPSILON_SECONDS) {
      // Timeline drifted too far ahead (clock drift between
      // AudioContext.currentTime and wall-clock, or burst arrival). Reset to
      // target lead and schedule this frame instead of dropping it — dropping
      // would cause an audio gap and a death-spiral where nextEndSeconds stays
      // elevated and every subsequent frame also overflows until real time
      // catches up (~100-150ms of silence).
      this.clearSources();
      startTime = now + this.targetLeadSeconds;
      timelineReset = true;
      endTime = startTime + frame.buffer.duration;
    }

    let source: AudioTimelineSource | null = null;
    try {
      source = this.options.createSource(frame.buffer);
      source.setOnEnded(() => this.releaseSource(source!));
      this.sources.add(source);
      source.start(startTime);
    } catch {
      if (source) this.releaseSource(source);
      return this.dropped("source-error", now, timelineReset, underrun);
    }

    this.nextEndSeconds = endTime;
    return {
      status: "scheduled",
      startTimeSeconds: startTime,
      endTimeSeconds: endTime,
      horizonMs: Math.max(0, (endTime - now) * 1_000),
      activeSources: this.sources.size,
      timelineReset,
      underrun,
    };
  }

  resume(): void {
    if (!this.disposed) this.suspended = false;
  }

  suspend(): void {
    if (this.disposed || this.suspended) return;
    this.suspended = true;
    this.clearTimeline();
  }

  reset(): void {
    if (this.disposed) return;
    this.clearTimeline();
    this.streamId = null;
    this.lastFrameId = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimeline();
    this.streamId = null;
    this.lastFrameId = null;
  }

  get activeSourceCount(): number {
    return this.sources.size;
  }

  private dropped(
    reason: AudioTimelineDropReason,
    now: number,
    timelineReset: boolean,
    underrun = false,
  ): AudioTimelinePushResult {
    return {
      status: "dropped",
      reason,
      horizonMs: Math.max(0, ((this.nextEndSeconds ?? now) - now) * 1_000),
      activeSources: this.sources.size,
      timelineReset,
      underrun,
    };
  }

  private clearTimeline(): void {
    this.clearSources();
    this.nextEndSeconds = null;
  }

  private clearSources(): void {
    for (const source of this.sources) {
      source.setOnEnded(null);
      try { source.stop(); } catch { /* A source may already have ended. */ }
      source.dispose();
    }
    this.sources.clear();
    this.nextEndSeconds = null;
  }

  private releaseSource(source: AudioTimelineSource): void {
    if (!this.sources.delete(source)) return;
    source.setOnEnded(null);
    source.dispose();
  }
}
