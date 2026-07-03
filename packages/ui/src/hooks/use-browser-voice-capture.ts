import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@robo-fleet/shared/types";
import type { Socket } from "socket.io-client";

const FRAME_DURATION_MS = 50;
const PROCESSOR_NAME = "browser-voice-capture";
const FLUSH_TIMEOUT_MS = 100;

export type BrowserVoiceSocket = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;

export type BrowserVoiceCaptureState =
  | "idle"
  | "starting"
  | "capturing"
  | "stopping"
  | "error";

interface UseBrowserVoiceCaptureOptions {
  socket: BrowserVoiceSocket | null;
  enabled: boolean;
  targetEntityId: string | null;
  onLog?: (
    message: string,
    type?: "info" | "success" | "error" | "warning",
  ) => void;
}

export interface UseBrowserVoiceCaptureReturn {
  state: BrowserVoiceCaptureState;
  isCapturing: boolean;
  audioLevel: number;
  error: string | null;
  capturedTargetEntityId: string | null;
  start: () => Promise<boolean>;
  stop: () => Promise<void>;
}

interface WorkletAudioMessage {
  type: "audio-data";
  audioData: Float32Array;
}

interface WorkletFlushMessage {
  type: "flush-complete";
}

type WorkletMessage = WorkletAudioMessage | WorkletFlushMessage;

interface CaptureResources {
  socket: BrowserVoiceSocket;
  streamId: string;
  sampleRate: number;
  mediaStream: MediaStream;
  audioContext: AudioContext;
  sourceNode: MediaStreamAudioSourceNode;
  analyserNode: AnalyserNode;
  workletNode: AudioWorkletNode;
  animationFrameId: number | null;
  nextFrameId: number;
  startSent: boolean;
  stopSent: boolean;
  stopping: boolean;
  flushComplete: (() => void) | null;
  releasePromise: Promise<void> | null;
}

function createProcessorUrl(frameSize: number): string {
  const processorCode = `
    class BrowserVoiceCaptureProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this.frameSize = ${frameSize};
        this.buffer = new Float32Array(this.frameSize);
        this.bufferIndex = 0;
        this.port.onmessage = (event) => {
          if (event.data && event.data.type === "flush") {
            this.postFrame();
            this.port.postMessage({ type: "flush-complete" });
          }
        };
      }

      postFrame() {
        if (this.bufferIndex === 0) return;
        const frame = this.buffer.slice(0, this.bufferIndex);
        this.port.postMessage(
          { type: "audio-data", audioData: frame },
          [frame.buffer],
        );
        this.buffer = new Float32Array(this.frameSize);
        this.bufferIndex = 0;
      }

      process(inputs) {
        const channel = inputs[0] && inputs[0][0];
        if (!channel) return true;
        for (let index = 0; index < channel.length; index += 1) {
          this.buffer[this.bufferIndex] = channel[index];
          this.bufferIndex += 1;
          if (this.bufferIndex === this.frameSize) this.postFrame();
        }
        return true;
      }
    }

    registerProcessor("${PROCESSOR_NAME}", BrowserVoiceCaptureProcessor);
  `;
  return URL.createObjectURL(
    new Blob([processorCode], { type: "application/javascript" }),
  );
}

function isWorkletMessage(value: unknown): value is WorkletMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }
  const type = (value as { type: unknown }).type;
  if (type === "flush-complete") return true;
  return (
    type === "audio-data" &&
    "audioData" in value &&
    (value as { audioData: unknown }).audioData instanceof Float32Array
  );
}

function microphoneError(error: unknown): string {
  if (!(error instanceof Error)) return "Unable to start microphone capture";
  switch (error.name) {
    case "NotAllowedError":
      return "Microphone permission denied";
    case "NotFoundError":
      return "No microphone was found";
    case "NotReadableError":
      return "Microphone is already in use";
    default:
      return error.message || "Unable to start microphone capture";
  }
}

export function useBrowserVoiceCapture({
  socket,
  enabled,
  targetEntityId,
  onLog,
}: UseBrowserVoiceCaptureOptions): UseBrowserVoiceCaptureReturn {
  const [state, setState] = useState<BrowserVoiceCaptureState>("idle");
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [capturedTargetEntityId, setCapturedTargetEntityId] = useState<
    string | null
  >(null);

  const resourcesRef = useRef<CaptureResources | null>(null);
  const generationRef = useRef(0);
  const startPendingRef = useRef(false);
  const mountedRef = useRef(true);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const setStateIfMounted = useCallback(
    (nextState: BrowserVoiceCaptureState): void => {
      if (mountedRef.current) setState(nextState);
    },
    [],
  );

  const flushPendingAudio = useCallback(
    async (resources: CaptureResources): Promise<void> => {
      if (!resources.startSent || !resources.socket.connected) return;
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          resources.flushComplete = null;
          window.clearTimeout(timeoutId);
          resolve();
        };
        const timeoutId = window.setTimeout(finish, FLUSH_TIMEOUT_MS);
        resources.flushComplete = finish;
        resources.workletNode.port.postMessage({ type: "flush" });
      });
    },
    [],
  );

  const releaseResources = useCallback(
    (resources: CaptureResources, emitStop: boolean): Promise<void> => {
      if (resources.releasePromise) return resources.releasePromise;
      const releasePromise = (async (): Promise<void> => {
        if (resources.animationFrameId !== null) {
          cancelAnimationFrame(resources.animationFrameId);
          resources.animationFrameId = null;
        }
        resources.sourceNode.disconnect();

        if (emitStop) await flushPendingAudio(resources);
        if (
          emitStop &&
          resources.startSent &&
          !resources.stopSent &&
          resources.socket.connected
        ) {
          resources.stopSent = true;
          resources.socket.emit("voice_command_control", {
            command: "stop",
            stream_id: resources.streamId,
          });
        }

        resources.flushComplete?.();
        resources.flushComplete = null;
        resources.workletNode.port.onmessage = null;
        resources.workletNode.disconnect();
        resources.analyserNode.disconnect();
        resources.mediaStream.getTracks().forEach((track) => track.stop());
        if (resources.audioContext.state !== "closed") {
          await resources.audioContext.close().catch(() => undefined);
        }
      })();
      resources.releasePromise = releasePromise;
      return releasePromise;
    },
    [flushPendingAudio],
  );

  const stopCapture = useCallback(
    async (emitStop: boolean, nextError: string | null = null): Promise<void> => {
      generationRef.current += 1;
      const resources = resourcesRef.current;
      if (resources?.stopping) {
        if (resources.releasePromise) await resources.releasePromise;
        return;
      }

      if (resources) {
        resources.stopping = true;
        setStateIfMounted("stopping");
        await releaseResources(resources, emitStop);
        if (resourcesRef.current === resources) resourcesRef.current = null;
      }

      if (mountedRef.current) {
        setAudioLevel(0);
        setCapturedTargetEntityId(null);
        setError(nextError);
        setState(nextError ? "error" : "idle");
      }
    },
    [releaseResources, setStateIfMounted],
  );

  const stop = useCallback(async (): Promise<void> => {
    await stopCapture(true);
    onLog?.("Browser voice commands stopped", "info");
  }, [onLog, stopCapture]);

  const start = useCallback(async (): Promise<boolean> => {
    const displayTarget = targetEntityId?.trim() ?? "";
    if (!enabled || !socket?.connected || !displayTarget) {
      setError("Voice commands are not ready");
      setState("error");
      return false;
    }
    if (resourcesRef.current || startPendingRef.current || state === "starting") {
      return false;
    }
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setError("Microphone requires HTTPS or localhost");
      setState("error");
      return false;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    startPendingRef.current = true;
    setError(null);
    setAudioLevel(0);
    setState("starting");

    let mediaStream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let analyserNode: AnalyserNode | null = null;
    let workletNode: AudioWorkletNode | null = null;
    let resources: CaptureResources | null = null;

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      if (
        generationRef.current !== generation ||
        !enabledRef.current ||
        !socket.connected
      ) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return false;
      }

      audioContext = new AudioContext();
      const sampleRate = audioContext.sampleRate;
      const frameSize = Math.max(
        1,
        Math.round((sampleRate * FRAME_DURATION_MS) / 1_000),
      );
      const processorUrl = createProcessorUrl(frameSize);
      try {
        await audioContext.audioWorklet.addModule(processorUrl);
      } finally {
        URL.revokeObjectURL(processorUrl);
      }

      if (
        generationRef.current !== generation ||
        !enabledRef.current ||
        !socket.connected
      ) {
        mediaStream.getTracks().forEach((track) => track.stop());
        await audioContext.close();
        return false;
      }

      sourceNode = audioContext.createMediaStreamSource(mediaStream);
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 256;
      workletNode = new AudioWorkletNode(audioContext, PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
      });

      const nextStreamId = crypto.randomUUID();
      resources = {
        socket,
        streamId: nextStreamId,
        sampleRate,
        mediaStream,
        audioContext,
        sourceNode,
        analyserNode,
        workletNode,
        animationFrameId: null,
        nextFrameId: 0,
        startSent: false,
        stopSent: false,
        stopping: false,
        flushComplete: null,
        releasePromise: null,
      };
      resourcesRef.current = resources;

      workletNode.port.onmessage = (event: MessageEvent<unknown>): void => {
        if (!isWorkletMessage(event.data)) return;
        if (event.data.type === "flush-complete") {
          resources?.flushComplete?.();
          return;
        }
        if (
          resourcesRef.current !== resources ||
          !resources ||
          !resources.socket.connected
        ) {
          void stopCapture(false, "Voice connection was lost");
          return;
        }
        const samples = event.data.audioData;
        if (samples.length === 0) return;
        try {
          resources.socket.emit("voice_command_audio", {
            stream_id: resources.streamId,
            frame_id: resources.nextFrameId,
            sample_rate: resources.sampleRate,
            channels: 1,
            sample_count: samples.length,
            audio_data: Array.from(samples),
          });
          resources.nextFrameId += 1;
        } catch {
          void stopCapture(false, "Unable to send voice audio");
        }
      };

      socket.emit("voice_command_control", {
        command: "start",
        stream_id: nextStreamId,
        sample_rate: sampleRate,
        channels: 1,
      });
      resources.startSent = true;
      sourceNode.connect(analyserNode);
      analyserNode.connect(workletNode);
      await audioContext.resume();
      if (
        generationRef.current !== generation ||
        resources.stopping ||
        resourcesRef.current !== resources ||
        !enabledRef.current ||
        !socket.connected
      ) {
        if (resourcesRef.current === resources && !resources.stopping) {
          await stopCapture(socket.connected);
        }
        return false;
      }

      const levelData = new Uint8Array(analyserNode.frequencyBinCount);
      const updateLevel = (): void => {
        if (resourcesRef.current !== resources || resources?.stopping) return;
        analyserNode?.getByteFrequencyData(levelData);
        const average = levelData.reduce((sum, value) => sum + value, 0) /
          Math.max(1, levelData.length);
        if (mountedRef.current) setAudioLevel(average / 255);
        if (resources) {
          resources.animationFrameId = requestAnimationFrame(updateLevel);
        }
      };
      resources.animationFrameId = requestAnimationFrame(updateLevel);

      setCapturedTargetEntityId(displayTarget);
      setState("capturing");
      onLog?.(`Browser voice commands started for ${displayTarget}`, "success");
      return true;
    } catch (caught) {
      const message = microphoneError(caught);
      if (resources && resourcesRef.current === resources) {
        await releaseResources(resources, resources.startSent && socket.connected);
        resourcesRef.current = null;
      } else if (!resources) {
        workletNode?.disconnect();
        analyserNode?.disconnect();
        sourceNode?.disconnect();
        mediaStream?.getTracks().forEach((track) => track.stop());
        if (audioContext && audioContext.state !== "closed") {
          await audioContext.close().catch(() => undefined);
        }
      }
      const isCurrent = mountedRef.current && generationRef.current === generation;
      if (isCurrent) {
        setError(message);
        setAudioLevel(0);
        setCapturedTargetEntityId(null);
        setState("error");
        onLog?.(message, "error");
      }
      return false;
    } finally {
      startPendingRef.current = false;
    }
  }, [
    enabled,
    onLog,
    releaseResources,
    socket,
    state,
    stopCapture,
    targetEntityId,
  ]);

  useEffect(() => {
    if (!enabled) void stopCapture(socket?.connected ?? false);
  }, [enabled, socket, stopCapture]);

  useEffect(() => {
    if (!socket) return undefined;
    const handleDisconnect = (): void => {
      void stopCapture(false, "Voice connection was lost");
    };
    socket.on("disconnect", handleDisconnect);
    return () => {
      socket.off("disconnect", handleDisconnect);
    };
  }, [socket, stopCapture]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      const resources = resourcesRef.current;
      if (resources && !resources.stopping) {
        resources.stopping = true;
        void releaseResources(resources, resources.socket.connected).finally(() => {
          if (resourcesRef.current === resources) resourcesRef.current = null;
        });
      }
    };
  }, [releaseResources]);

  return {
    state,
    isCapturing: state === "capturing",
    audioLevel,
    error,
    capturedTargetEntityId,
    start,
    stop,
  };
}
