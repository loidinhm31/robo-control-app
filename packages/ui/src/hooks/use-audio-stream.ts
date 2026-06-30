import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { AudioBinaryPayload, AudioFrameEvent } from "@robo-fleet/shared/types";
import {
  AudioStreamMetrics,
  AudioTimelineScheduler,
  createPcmAudioBuffer,
  createTimelineSource,
  normalizeAudioFrame,
  observeLongTasks,
} from "../lib";
import type { AudioStreamMetricsSnapshot, NormalizedAudioFrame } from "../lib";

const MAX_PENDING_AUDIO_DECODES = 4;

type AudioPlaybackState = AudioContextState | "uninitialized";

interface PendingAudioBuffer {
  duration: number;
  frame: NormalizedAudioFrame;
}

interface UseAudioStreamOptions {
  socket: Socket | null;
  enabled: boolean;
  debugEnabled?: boolean;
}

export interface UseAudioStreamReturn {
  activate: () => Promise<void>;
  reset: () => void;
  contextState: AudioPlaybackState;
  metrics: AudioStreamMetricsSnapshot;
  volume: number;
  setVolume: (volume: number) => void;
}

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

const closeAudioContext = (context: AudioContext): void => {
  void context.close().catch(() => undefined);
};

export const useAudioStream = ({
  socket,
  enabled,
  debugEnabled = false,
}: UseAudioStreamOptions): UseAudioStreamReturn => {
  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const schedulerRef = useRef<AudioTimelineScheduler<PendingAudioBuffer> | null>(null);
  const metricsRef = useRef(new AudioStreamMetrics());
  const lastMetricsPublishRef = useRef(0);
  const lastDebugLogRef = useRef(0);
  const [contextState, setContextState] = useState<AudioPlaybackState>("uninitialized");
  const [metrics, setMetrics] = useState(() => metricsRef.current.snapshot());
  const [volume, setVolumeState] = useState(1);

  const publishMetrics = useCallback((): void => {
    const monotonicNow = performance.now();
    if (monotonicNow - lastMetricsPublishRef.current < 1_000) return;
    lastMetricsPublishRef.current = monotonicNow;
    const snapshot = metricsRef.current.snapshot();
    setMetrics(snapshot);

    if (debugEnabled && snapshot.capturedAtMs - lastDebugLogRef.current >= 5_000) {
      lastDebugLogRef.current = snapshot.capturedAtMs;
      const transport = socket?.io.engine?.transport?.name ?? "unknown";
      console.info("audio_stream_metrics", JSON.stringify({ ...snapshot, transport }));
    }
  }, [debugEnabled, socket]);

  const activate = useCallback(async (): Promise<void> => {
    let pendingContext: AudioContext | null = null;
    try {
      if (!contextRef.current) {
        const AudioContextConstructor = window.AudioContext ??
          (window as WindowWithWebkitAudio).webkitAudioContext;
        if (!AudioContextConstructor) throw new Error("Web Audio API is unavailable");

        const context = new AudioContextConstructor();
        pendingContext = context;
        const gain = context.createGain();
        const filter = context.createBiquadFilter();
        gain.gain.value = volume;
        filter.type = "lowpass";
        filter.frequency.value = 8_000;
        filter.Q.value = 0.7;
        gain.connect(filter);
        filter.connect(context.destination);

        contextRef.current = context;
        gainRef.current = gain;
        schedulerRef.current = new AudioTimelineScheduler({
          now: () => context.currentTime,
          createSource: (pending) => createTimelineSource(
            context,
            gain,
            createPcmAudioBuffer(context, pending.frame),
          ),
        });
        context.onstatechange = () => {
          setContextState(context.state);
          if (context.state === "running") schedulerRef.current?.resume();
          else {
            schedulerRef.current?.suspend();
            metricsRef.current.recordPlayback(0, 0, 0);
            setMetrics(metricsRef.current.snapshot());
          }
        };
        pendingContext = null;
      }

      const context = contextRef.current;
      if (context.state === "suspended") await context.resume();
      setContextState(context.state);
      if (context.state === "running") schedulerRef.current?.resume();
    } catch (error) {
      if (pendingContext) closeAudioContext(pendingContext);
      console.error("Failed to activate audio playback", error);
      setContextState(contextRef.current?.state ?? "uninitialized");
    }
  }, [volume]);

  const reset = useCallback((): void => {
    schedulerRef.current?.suspend();
    metricsRef.current.reset();
    lastMetricsPublishRef.current = 0;
    lastDebugLogRef.current = 0;
    setMetrics(metricsRef.current.snapshot());
  }, []);

  const setVolume = useCallback((nextVolume: number): void => {
    const boundedVolume = Math.min(1, Math.max(0, nextVolume));
    setVolumeState(boundedVolume);
    if (gainRef.current) gainRef.current.gain.value = boundedVolume;
  }, []);

  useEffect(() => {
    if (!enabled) {
      schedulerRef.current?.suspend();
      return;
    }
    if (contextRef.current?.state === "running") schedulerRef.current?.resume();
  }, [enabled]);

  useEffect(() => {
    metricsRef.current.reset();
    lastMetricsPublishRef.current = 0;
    lastDebugLogRef.current = 0;
    const observation = observeLongTasks(
      debugEnabled && enabled,
      (durationMs) => metricsRef.current.recordLongTask(durationMs),
    );
    metricsRef.current.setLongTaskObserver(observation.status);
    setMetrics(metricsRef.current.snapshot());
    return observation.disconnect;
  }, [debugEnabled, enabled, socket]);

  useEffect(() => {
    if (!socket || !enabled) return;
    let active = true;
    let pendingDecodes = 0;
    let frameSequence = Promise.resolve();

    const processFrame = async (frame: AudioFrameEvent, binary?: AudioBinaryPayload): Promise<void> => {
      const receivedAt = performance.now();
      try {
        const normalized = await normalizeAudioFrame(frame, binary);
        if (!active) return;
        metricsRef.current.recordFrame(normalized, receivedAt, Date.now());
        const context = contextRef.current;
        const scheduler = schedulerRef.current;
        if (!context || !scheduler || context.state !== "running") {
          metricsRef.current.recordSchedulerDrop("suspended");
          metricsRef.current.recordPlayback(0, 0, 0);
          publishMetrics();
          return;
        }

        const result = scheduler.push({
          streamId: normalized.streamId ?? `legacy:${normalized.entityId ?? "unknown"}`,
          frameId: normalized.frameId,
          ageMs: Math.max(0, Date.now() - normalized.captureTimestampMs),
          buffer: {
            duration: normalized.durationMs / 1_000,
            frame: normalized,
          },
        });
        if (result.timelineReset) metricsRef.current.recordTimelineReset();
        if (result.underrun) metricsRef.current.recordUnderrun();
        if (result.status === "scheduled") metricsRef.current.recordScheduledFrame();
        else if (result.reason) metricsRef.current.recordSchedulerDrop(result.reason);
        metricsRef.current.recordPlayback(result.activeSources, result.horizonMs, result.horizonMs);
      } catch {
        metricsRef.current.recordInvalidFrame();
      }
      publishMetrics();
    };

    const handleFrame = (frame: AudioFrameEvent, binary?: AudioBinaryPayload): void => {
      if (pendingDecodes >= MAX_PENDING_AUDIO_DECODES) {
        metricsRef.current.recordDecoderDrop();
        publishMetrics();
        return;
      }
      pendingDecodes++;
      frameSequence = frameSequence
        .then(() => processFrame(frame, binary))
        .catch(() => metricsRef.current.recordInvalidFrame())
        .finally(() => { pendingDecodes = Math.max(0, pendingDecodes - 1); });
    };
    const handleDisconnect = (): void => {
      schedulerRef.current?.reset();
      metricsRef.current.recordTimelineReset();
      metricsRef.current.recordPlayback(0, 0, 0);
      publishMetrics();
    };

    socket.on("audio_frame", handleFrame);
    socket.on("disconnect", handleDisconnect);
    return () => {
      active = false;
      socket.off("audio_frame", handleFrame);
      socket.off("disconnect", handleDisconnect);
      schedulerRef.current?.reset();
    };
  }, [enabled, publishMetrics, socket]);

  useEffect(() => () => {
    schedulerRef.current?.dispose();
    schedulerRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    gainRef.current = null;
    if (context) {
      context.onstatechange = null;
      closeAudioContext(context);
    }
  }, []);

  return { activate, reset, contextState, metrics, volume, setVolume };
};
