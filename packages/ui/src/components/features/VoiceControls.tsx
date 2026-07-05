import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
  SpeechTranscription,
  SttStatus,
  TtsCommandAck,
  TtsCommandResult,
  TtsConfigState,
  TtsConfigUpdate,
  TtsLanguage,
  TtsRuntimeConfig,
  VoiceStatus,
} from "@robo-fleet/shared/types";
import { AlertCircle, ChevronDown, Headphones, Send, Shield, Volume2 } from "lucide-react";
import {
  useBrowserVoiceCapture,
  type BrowserVoiceSocket,
} from "../../hooks/use-browser-voice-capture";
import { DraggablePanel } from "../organisms";
import { StatusBadge } from "../atoms";
import { InputWithAction } from "../molecules";
import { VoiceCommandPanel } from "./voice-command-panel";
import {
  buildAckAlert,
  buildResultAlert,
  cloneTtsConfig,
  type VoiceAlertItem,
} from "./voice-controls-helpers";
import { VoiceAlertRegion } from "./voice-alert-region";
import { VoiceConfigCard } from "./voice-config-card";

const WALKIE_PROCESSOR_NAME = "walkie-talkie-capture";
const TTS_DISABLE_DELAY_MS = 300;
const TTS_CONFIG_DEBOUNCE_MS = 250;

interface VoiceControlsProps {
  socket: BrowserVoiceSocket | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  sttStatus: SttStatus | null;
  selectedEntityId: string | null;
  browserTranscriptions: readonly SpeechTranscription[];
  ttsConfigState: TtsConfigState | null;
  voiceStatuses: readonly VoiceStatus[];
  lastTtsAck: TtsCommandAck | null;
  lastTtsResult: TtsCommandResult | null;
  onSendTts: (text: string) => void;
  onUpdateTtsConfig: (update: TtsConfigUpdate) => void;
  onLog?: (
    message: string,
    type?: "info" | "success" | "error" | "warning",
  ) => void;
}

interface WalkieResources {
  audioContext: AudioContext;
  mediaStream: MediaStream;
  sourceNode: MediaStreamAudioSourceNode;
  analyserNode: AnalyserNode;
  workletNode: AudioWorkletNode;
  animationFrameId: number | null;
}

function createWalkieProcessorUrl(frameSize: number): string {
  const processorCode = `
    class WalkieTalkieCaptureProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this.frameSize = ${frameSize};
        this.buffer = new Float32Array(this.frameSize);
        this.index = 0;
      }

      process(inputs) {
        const channel = inputs[0] && inputs[0][0];
        if (!channel) return true;
        for (let index = 0; index < channel.length; index += 1) {
          this.buffer[this.index] = channel[index];
          this.index += 1;
          if (this.index === this.frameSize) {
            const frame = this.buffer;
            this.port.postMessage(
              { type: "audio-data", audioData: frame },
              [frame.buffer],
            );
            this.buffer = new Float32Array(this.frameSize);
            this.index = 0;
          }
        }
        return true;
      }
    }

    registerProcessor("${WALKIE_PROCESSOR_NAME}", WalkieTalkieCaptureProcessor);
  `;
  return URL.createObjectURL(
    new Blob([processorCode], { type: "application/javascript" }),
  );
}

async function releaseWalkieResources(
  resources: WalkieResources,
): Promise<void> {
  if (resources.animationFrameId !== null) {
    cancelAnimationFrame(resources.animationFrameId);
    resources.animationFrameId = null;
  }
  resources.workletNode.port.onmessage = null;
  resources.sourceNode.disconnect();
  resources.analyserNode.disconnect();
  resources.workletNode.disconnect();
  resources.mediaStream.getTracks().forEach((track) => track.stop());
  if (resources.audioContext.state !== "closed") {
    await resources.audioContext.close().catch(() => undefined);
  }
}

function browserDisabledReason(
  isConnected: boolean,
  isAuthenticated: boolean,
  sttStatus: SttStatus | null,
  selectedEntityId: string | null,
): string | null {
  if (!isConnected) return "Connect to the Orchestra server first.";
  if (!isAuthenticated) return "Wait for an authenticated session.";
  if (!sttStatus) return "Waiting for authoritative STT status.";
  if (sttStatus.state === "loading") return "The central STT model is loading.";
  if (sttStatus.state === "error") return "Central STT is unavailable.";
  if (!selectedEntityId) return "Select a target rover before starting.";
  return null;
}

function replaceAlert(
  alerts: readonly VoiceAlertItem[],
  nextAlert: VoiceAlertItem,
): VoiceAlertItem[] {
  return [nextAlert, ...alerts.filter((alert) => alert.id !== nextAlert.id)]
    .slice(0, 3);
}

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  socket,
  isConnected,
  isAuthenticated,
  sttStatus,
  selectedEntityId,
  browserTranscriptions,
  ttsConfigState,
  voiceStatuses,
  lastTtsAck,
  lastTtsResult,
  onSendTts,
  onUpdateTtsConfig,
  onLog,
}) => {
  const [ttsText, setTtsText] = useState("");
  const [isSendingTTS, setIsSendingTTS] = useState(false);
  const [isWalkieActive, setIsWalkieActive] = useState(false);
  const [isWalkieStarting, setIsWalkieStarting] = useState(false);
  const [walkieAudioLevel, setWalkieAudioLevel] = useState(0);
  const [walkieError, setWalkieError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [alerts, setAlerts] = useState<VoiceAlertItem[]>([]);
  const [draftConfig, setDraftConfig] = useState<TtsRuntimeConfig | null>(null);
  const [pendingRevision, setPendingRevision] = useState<number | null>(null);
  const [pendingBaseRevision, setPendingBaseRevision] = useState<number | null>(null);

  const walkieResourcesRef = useRef<WalkieResources | null>(null);
  const walkieGenerationRef = useRef(0);
  const walkieStartPendingRef = useRef(false);
  const mountedRef = useRef(true);
  const ttsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftConfigRef = useRef<TtsRuntimeConfig | null>(null);
  const ttsConfigStateRef = useRef<TtsConfigState | null>(ttsConfigState);
  const pendingRevisionRef = useRef<number | null>(pendingRevision);
  const pendingBaseRevisionRef = useRef<number | null>(pendingBaseRevision);

  const disabledReason = browserDisabledReason(
    isConnected,
    isAuthenticated,
    sttStatus,
    selectedEntityId,
  );
  const browserCapture = useBrowserVoiceCapture({
    socket,
    enabled: disabledReason === null,
    targetEntityId: selectedEntityId,
    onLog,
  });

  const selectedVoiceStatus = selectedEntityId == null
    ? null
    : voiceStatuses.find((status) => status.entity_id === selectedEntityId) ?? null;

  const ttsDisabledReason = !isConnected
    ? "Connect to the Orchestra server first."
    : !isAuthenticated
      ? "Wait for an authenticated session."
      : isWalkieActive || isWalkieStarting
        ? "Live walkie-talkie has priority over local TTS."
        : null;

  const pushAlert = useCallback((nextAlert: VoiceAlertItem | null): void => {
    if (!nextAlert) return;
    setAlerts((current) => replaceAlert(current, nextAlert));
    onLog?.(
      `${nextAlert.title}${nextAlert.entityId ? ` [${nextAlert.entityId}]` : ""}: ${nextAlert.message}`,
      nextAlert.tone === "error" ? "error" : "warning",
    );
  }, [onLog]);

  const clearSendTimer = useCallback((): void => {
    if (ttsTimerRef.current) {
      window.clearTimeout(ttsTimerRef.current);
      ttsTimerRef.current = null;
    }
  }, []);

  const clearConfigDebounce = useCallback((): void => {
    if (configDebounceRef.current) {
      window.clearTimeout(configDebounceRef.current);
      configDebounceRef.current = null;
    }
  }, []);

  const dispatchConfigUpdate = useCallback((config: TtsRuntimeConfig): void => {
    const latestConfigState = ttsConfigStateRef.current;
    if (!latestConfigState || !isConnected || !isAuthenticated) return;
    const baseRevision = Math.max(
      latestConfigState.desired_revision,
      pendingRevisionRef.current ?? 0,
    );
    onUpdateTtsConfig({
      base_revision: baseRevision,
      config,
    });
    pendingBaseRevisionRef.current = baseRevision;
    pendingRevisionRef.current = baseRevision + 1;
    setPendingBaseRevision(baseRevision);
    setPendingRevision(baseRevision + 1);
  }, [isAuthenticated, isConnected, onUpdateTtsConfig]);

  const updateDraftConfig = useCallback((
    transform: (current: TtsRuntimeConfig) => TtsRuntimeConfig,
    mode: "immediate" | "debounced",
  ): void => {
    const current = draftConfigRef.current ?? ttsConfigState?.desired_config;
    if (!current) return;
    const next = transform(cloneTtsConfig(current));
    draftConfigRef.current = next;
    setDraftConfig(next);
    if (mode === "immediate") {
      clearConfigDebounce();
      dispatchConfigUpdate(next);
      return;
    }
    clearConfigDebounce();
    configDebounceRef.current = window.setTimeout(() => {
      configDebounceRef.current = null;
      dispatchConfigUpdate(next);
    }, TTS_CONFIG_DEBOUNCE_MS);
  }, [clearConfigDebounce, dispatchConfigUpdate, ttsConfigState]);

  const sendTTS = useCallback(
    (text: string): void => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (ttsDisabledReason) {
        onLog?.(ttsDisabledReason, "warning");
        return;
      }
      clearSendTimer();
      setIsSendingTTS(true);
      onSendTts(trimmed);
      onLog?.(`Queued rover speech: "${trimmed}"`, "info");
      ttsTimerRef.current = window.setTimeout(() => {
        setIsSendingTTS(false);
        ttsTimerRef.current = null;
      }, TTS_DISABLE_DELAY_MS);
    },
    [clearSendTimer, onLog, onSendTts, ttsDisabledReason],
  );

  const stopWalkieTalkie = useCallback(async (): Promise<void> => {
    walkieGenerationRef.current += 1;
    const resources = walkieResourcesRef.current;
    walkieResourcesRef.current = null;
    if (resources) await releaseWalkieResources(resources);
    if (mountedRef.current) {
      setIsWalkieActive(false);
      setIsWalkieStarting(false);
      setWalkieAudioLevel(0);
    }
  }, []);

  const startWalkieTalkie = useCallback(async (): Promise<void> => {
    if (!isConnected || !socket?.connected) {
      onLog?.("Cannot start walkie-talkie - not connected", "error");
      return;
    }
    if (walkieStartPendingRef.current || walkieResourcesRef.current) return;
    const generation = walkieGenerationRef.current + 1;
    walkieGenerationRef.current = generation;
    walkieStartPendingRef.current = true;
    setIsWalkieStarting(true);
    setWalkieError(null);
    let mediaStream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let analyserNode: AnalyserNode | null = null;
    let workletNode: AudioWorkletNode | null = null;
    let resources: WalkieResources | null = null;
    try {
      if (!window.isSecureContext && window.location.hostname !== "localhost") {
        throw new Error("Microphone requires HTTPS or localhost");
      }
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16_000,
          channelCount: 1,
        },
      });
      if (
        !mountedRef.current ||
        walkieGenerationRef.current !== generation ||
        !socket.connected
      ) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }

      audioContext = new AudioContext({ sampleRate: 16_000 });
      sourceNode = audioContext.createMediaStreamSource(mediaStream);
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 256;
      const frameSize = Math.max(1, Math.round(audioContext.sampleRate * 0.05));
      const processorUrl = createWalkieProcessorUrl(frameSize);
      try {
        await audioContext.audioWorklet.addModule(processorUrl);
      } finally {
        URL.revokeObjectURL(processorUrl);
      }
      if (
        !mountedRef.current ||
        walkieGenerationRef.current !== generation ||
        !socket.connected
      ) {
        sourceNode.disconnect();
        analyserNode.disconnect();
        mediaStream.getTracks().forEach((track) => track.stop());
        await audioContext.close();
        return;
      }
      workletNode = new AudioWorkletNode(audioContext, WALKIE_PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
      });
      workletNode.port.onmessage = (event: MessageEvent<unknown>): void => {
        if (
          socket.connected &&
          typeof event.data === "object" &&
          event.data !== null &&
          "type" in event.data &&
          event.data.type === "audio-data" &&
          "audioData" in event.data &&
          event.data.audioData instanceof Float32Array
        ) {
          socket.emit("audio_stream", {
            audio_data: Array.from(event.data.audioData),
          });
        }
      };
      resources = {
        audioContext,
        mediaStream,
        sourceNode,
        analyserNode,
        workletNode,
        animationFrameId: null,
      };
      walkieResourcesRef.current = resources;
      sourceNode.connect(analyserNode);
      analyserNode.connect(workletNode);
      await audioContext.resume();
      if (
        !mountedRef.current ||
        walkieGenerationRef.current !== generation ||
        walkieResourcesRef.current !== resources ||
        !socket.connected
      ) {
        if (walkieResourcesRef.current === resources) {
          walkieResourcesRef.current = null;
          await releaseWalkieResources(resources);
        }
        return;
      }
      const activeResources = resources;
      const levelData = new Uint8Array(analyserNode.frequencyBinCount);
      const updateLevel = (): void => {
        if (walkieResourcesRef.current !== activeResources) return;
        analyserNode?.getByteFrequencyData(levelData);
        const average = levelData.reduce((sum, value) => sum + value, 0) /
          Math.max(1, levelData.length);
        setWalkieAudioLevel(average / 255);
        activeResources.animationFrameId = requestAnimationFrame(updateLevel);
      };
      activeResources.animationFrameId = requestAnimationFrame(updateLevel);
      setIsWalkieActive(true);
      setIsWalkieStarting(false);
      onLog?.("Walkie-talkie started", "success");
    } catch (caught) {
      const message = caught instanceof Error
        ? caught.message
        : "Failed to start walkie-talkie";
      if (resources && walkieResourcesRef.current === resources) {
        walkieResourcesRef.current = null;
        await releaseWalkieResources(resources);
      } else if (!resources) {
        workletNode?.disconnect();
        analyserNode?.disconnect();
        sourceNode?.disconnect();
        mediaStream?.getTracks().forEach((track) => track.stop());
        if (audioContext && audioContext.state !== "closed") {
          await audioContext.close().catch(() => undefined);
        }
      }
      if (mountedRef.current && walkieGenerationRef.current === generation) {
        setWalkieError(message);
        setIsWalkieActive(false);
        setIsWalkieStarting(false);
        onLog?.(message, "error");
      }
    } finally {
      walkieStartPendingRef.current = false;
      if (
        mountedRef.current &&
        walkieGenerationRef.current === generation &&
        walkieResourcesRef.current === null
      ) {
        setIsWalkieStarting(false);
      }
    }
  }, [isConnected, onLog, socket]);

  const toggleBrowserCapture = useCallback(async (): Promise<void> => {
    if (browserCapture.isCapturing) {
      await browserCapture.stop();
      return;
    }
    if (isWalkieActive || isWalkieStarting) await stopWalkieTalkie();
    await browserCapture.start();
  }, [
    browserCapture,
    isWalkieActive,
    isWalkieStarting,
    stopWalkieTalkie,
  ]);

  const toggleWalkieTalkie = useCallback(async (): Promise<void> => {
    if (isWalkieActive) {
      await stopWalkieTalkie();
      onLog?.("Walkie-talkie stopped", "info");
      return;
    }
    if (browserCapture.state !== "idle") await browserCapture.stop();
    await startWalkieTalkie();
  }, [
    browserCapture,
    isWalkieActive,
    onLog,
    startWalkieTalkie,
    stopWalkieTalkie,
  ]);

  useEffect(() => {
    draftConfigRef.current = draftConfig;
  }, [draftConfig]);

  useEffect(() => {
    ttsConfigStateRef.current = ttsConfigState;
  }, [ttsConfigState]);

  useEffect(() => {
    pendingRevisionRef.current = pendingRevision;
  }, [pendingRevision]);

  useEffect(() => {
    pendingBaseRevisionRef.current = pendingBaseRevision;
  }, [pendingBaseRevision]);

  useEffect(() => {
    if (!ttsConfigState) {
      setDraftConfig(null);
      draftConfigRef.current = null;
      pendingRevisionRef.current = null;
      pendingBaseRevisionRef.current = null;
      setPendingRevision(null);
      setPendingBaseRevision(null);
      clearConfigDebounce();
      return;
    }

    const authoritativeConfig = cloneTtsConfig(ttsConfigState.desired_config);
    const hasDebouncedLocalDraft = configDebounceRef.current !== null;
    const pendingResolved = pendingRevisionRef.current !== null && (
      ttsConfigState.desired_revision >= pendingRevisionRef.current
        || ttsConfigState.desired_revision === pendingBaseRevisionRef.current
    );

    if (
      draftConfigRef.current === null
      || pendingResolved
      || (!hasDebouncedLocalDraft && pendingRevisionRef.current === null)
    ) {
      setDraftConfig(authoritativeConfig);
      draftConfigRef.current = authoritativeConfig;
    }

    if (pendingResolved) {
      pendingRevisionRef.current = null;
      pendingBaseRevisionRef.current = null;
      setPendingRevision(null);
      setPendingBaseRevision(null);
      clearConfigDebounce();
    }
  }, [
    clearConfigDebounce,
    ttsConfigState,
  ]);

  useEffect(() => {
    if (!isConnected || !isAuthenticated || ttsConfigState === null) {
      setAlerts([]);
    }
  }, [isAuthenticated, isConnected, ttsConfigState]);

  useEffect(() => {
    if (!isConnected) void stopWalkieTalkie();
  }, [isConnected, stopWalkieTalkie]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearSendTimer();
      clearConfigDebounce();
      void stopWalkieTalkie();
    };
  }, [clearConfigDebounce, clearSendTimer, stopWalkieTalkie]);

  useEffect(() => {
    if (lastTtsAck?.state === "rejected") {
      clearSendTimer();
      setIsSendingTTS(false);
    }
    pushAlert(buildAckAlert(lastTtsAck));
  }, [clearSendTimer, lastTtsAck, pushAlert]);

  useEffect(() => {
    if (lastTtsResult && lastTtsResult.state !== "completed") {
      clearSendTimer();
      setIsSendingTTS(false);
    }
    pushAlert(buildResultAlert(lastTtsResult));
  }, [clearSendTimer, lastTtsResult, pushAlert]);

  const collapsedContent = (
    <button className="group flex items-center gap-2 rounded-full border border-slate-700/50 bg-slate-900/95 px-3 py-1.5 shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:shadow-xl drag-handle cursor-move">
      <Volume2 className="h-3.5 w-3.5 text-orange-400" />
      <span className="text-[10px] font-bold uppercase tracking-wide text-white">Voice</span>
      <ChevronDown className="h-3 w-3 text-slate-400 group-hover:text-slate-300" />
    </button>
  );

  return (
    <DraggablePanel
      title="VOICE CONTROL"
      isVisible={isVisible}
      onToggleVisible={() => setIsVisible(!isVisible)}
      initialPosition={{ x: 15, y: 55 }}
      collapsedContent={collapsedContent}
      className="max-w-md"
      contentClassName="flex-1 overflow-y-auto custom-scrollbar p-0"
      showControls={true}
    >
      <div className="space-y-3">
        {!isConnected && (
          <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-2">
            <AlertCircle className="h-4 w-4 text-yellow-400" />
            <span className="text-xs text-yellow-400">Not connected to server</span>
          </div>
        )}

        {walkieError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2">
            <Shield className="h-4 w-4 text-red-400" />
            <span className="text-xs text-red-400">{walkieError}</span>
          </div>
        )}

        <VoiceAlertRegion
          alerts={alerts}
          onDismiss={(id) => {
            setAlerts((current) => current.filter((alert) => alert.id !== id));
          }}
        />

        <VoiceConfigCard
          activeRovers={ttsConfigState?.active_rovers ?? 0}
          appliedRovers={ttsConfigState?.applied_rovers ?? 0}
          config={draftConfig}
          desiredRevision={ttsConfigState?.desired_revision ?? null}
          pendingRevision={pendingRevision}
          selectedStatus={selectedVoiceStatus}
          disabled={!isConnected || !isAuthenticated || ttsConfigState === null}
          onLanguageChange={(language: TtsLanguage) => {
            updateDraftConfig((current) => ({ ...current, language }), "immediate");
          }}
          onSpeakerChange={(speakerId: number) => {
            updateDraftConfig((current) => ({ ...current, speaker_id: speakerId }), "immediate");
          }}
          onQualityChange={(numSteps: number) => {
            updateDraftConfig((current) => ({ ...current, num_steps: numSteps }), "immediate");
          }}
          onSpeedChange={(speed: number) => {
            updateDraftConfig((current) => ({ ...current, speed }), "debounced");
          }}
          onVolumeChange={(volume: number) => {
            updateDraftConfig((current) => ({ ...current, volume }), "debounced");
          }}
        />

        <div className="glass-card-light rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-orange-400" />
              <h3 className="text-sm font-semibold text-white">Speak Message</h3>
            </div>
            <StatusBadge
              variant={ttsDisabledReason ? "warning" : "success"}
              label={ttsDisabledReason ? "TTS blocked" : "TTS ready"}
            />
          </div>
          <InputWithAction
            value={ttsText}
            onChange={setTtsText}
            onSubmit={sendTTS}
            placeholder="Type message for rover speech output"
            icon={Send}
            buttonText="Speak Now"
            disabled={Boolean(ttsDisabledReason) || isSendingTTS}
          />
          <p className="text-xs text-white/55">
            Uses the current authoritative global TTS config.
          </p>
          {ttsDisabledReason && (
            <p
              role="status"
              aria-live="polite"
              className="text-xs text-amber-200"
            >
              {ttsDisabledReason}
            </p>
          )}
        </div>

        <VoiceCommandPanel
          captureState={browserCapture.state}
          audioLevel={browserCapture.audioLevel}
          captureError={browserCapture.error}
          sttStatus={sttStatus}
          selectedTargetEntityId={selectedEntityId}
          capturedTargetEntityId={browserCapture.capturedTargetEntityId}
          transcriptions={browserTranscriptions}
          canStart={disabledReason === null}
          disabledReason={disabledReason}
          onToggleCapture={toggleBrowserCapture}
        />

        <div className="glass-card-light rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Headphones className="h-4 w-4 text-cyan-400" />
              <span className="text-sm font-semibold text-white">Walkie-Talkie</span>
            </div>
            <StatusBadge
              variant={isWalkieActive ? "online" : "offline"}
              label={isWalkieActive ? "Walkie live" : "Walkie idle"}
              animated={isWalkieActive}
            />
          </div>
          <p className="text-xs text-white/60">
            Live mic stream. Preempts browser capture and local TTS while active.
          </p>
          <button
            type="button"
            onClick={() => void toggleWalkieTalkie()}
            disabled={!isConnected || isWalkieStarting}
            data-testid="walkie-toggle"
            className={`w-full rounded-lg px-4 py-2 font-semibold transition-all duration-200 ${
              isWalkieActive
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {isWalkieStarting ? "Starting…" : isWalkieActive ? "Stop" : "Start"}
          </button>
          {isWalkieActive && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-white/60">
                <span>Audio Level</span>
                <span>{Math.round(walkieAudioLevel * 100)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700/50">
                <div
                  className="h-full bg-emerald-500 transition-all duration-100"
                  style={{ width: `${Math.min(100, walkieAudioLevel * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </DraggablePanel>
  );
};

export default VoiceControls;
