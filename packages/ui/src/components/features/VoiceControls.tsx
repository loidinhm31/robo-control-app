import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
  SpeechTranscription,
  SttStatus,
} from "@robo-fleet/shared/types";
import {
  AlertCircle,
  ChevronDown,
  Headphones,
  Radio,
  Send,
  Shield,
  Volume2,
} from "lucide-react";
import {
  useBrowserVoiceCapture,
  type BrowserVoiceSocket,
} from "../../hooks/use-browser-voice-capture";
import { DraggablePanel } from "../organisms";
import { InputWithAction } from "../molecules";
import { IconBadge, StatusBadge } from "../atoms";
import { VoiceCommandPanel } from "./voice-command-panel";

const WALKIE_PROCESSOR_NAME = "walkie-talkie-capture";

interface VoiceControlsProps {
  socket: BrowserVoiceSocket | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  sttStatus: SttStatus | null;
  selectedEntityId: string | null;
  browserTranscriptions: readonly SpeechTranscription[];
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

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  socket,
  isConnected,
  isAuthenticated,
  sttStatus,
  selectedEntityId,
  browserTranscriptions,
  onLog,
}) => {
  const [ttsText, setTtsText] = useState("");
  const [isSendingTTS, setIsSendingTTS] = useState(false);
  const [isWalkieActive, setIsWalkieActive] = useState(false);
  const [isWalkieStarting, setIsWalkieStarting] = useState(false);
  const [walkieAudioLevel, setWalkieAudioLevel] = useState(0);
  const [walkieError, setWalkieError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const walkieResourcesRef = useRef<WalkieResources | null>(null);
  const walkieGenerationRef = useRef(0);
  const walkieStartPendingRef = useRef(false);
  const mountedRef = useRef(true);
  const ttsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const sendTTS = useCallback(
    (text: string): void => {
      if (!isConnected || !socket?.connected || !text.trim()) {
        onLog?.("Cannot send TTS - not connected or empty text", "error");
        return;
      }
      if (ttsTimerRef.current) window.clearTimeout(ttsTimerRef.current);
      setIsSendingTTS(true);
      socket.emit("tts_command", { text: text.trim() });
      onLog?.(`TTS: "${text.trim()}"`, "success");
      ttsTimerRef.current = window.setTimeout(() => {
        setIsSendingTTS(false);
        ttsTimerRef.current = null;
      }, 300);
    },
    [isConnected, onLog, socket],
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
      if (!resources) return;
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
    if (!isConnected) void stopWalkieTalkie();
  }, [isConnected, stopWalkieTalkie]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (ttsTimerRef.current) window.clearTimeout(ttsTimerRef.current);
      void stopWalkieTalkie();
    };
  }, [stopWalkieTalkie]);

  const activeMode = browserCapture.isCapturing
    ? "Commands"
    : isWalkieActive
      ? "Walkie"
      : null;
  const collapsedContent = (
    <button className="group flex items-center gap-2 px-3 py-1.5 bg-slate-900/95 backdrop-blur-md border border-slate-700/50 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 drag-handle cursor-move">
      <Volume2 className="w-3.5 h-3.5 text-orange-400" />
      <span className="text-[10px] font-bold text-white uppercase tracking-wide">Voice</span>
      <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-slate-300" />
    </button>
  );

  return (
    <DraggablePanel
      title="VOICE COMMUNICATION"
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
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-yellow-400">Not connected to server</span>
          </div>
        )}

        {walkieError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 flex items-center gap-2">
            <Shield className="w-4 h-4 text-red-400" />
            <span className="text-xs text-red-400">{walkieError}</span>
          </div>
        )}

        <div className="glass-card-light rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-semibold text-white">Text-to-Speech</h3>
          </div>
          <InputWithAction
            value={ttsText}
            onChange={setTtsText}
            onSubmit={sendTTS}
            placeholder="Type message to speak..."
            icon={Send}
            disabled={!isConnected || isSendingTTS}
          />
        </div>

        <div className="glass-card-light rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-green-400" />
            <h3 className="text-sm font-semibold text-white">Voice Modes</h3>
            {activeMode && (
              <IconBadge
                icon={isWalkieActive ? Headphones : Radio}
                label={activeMode}
                color="text-green-400"
                size="sm"
                animated
              />
            )}
          </div>
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
              <Headphones className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-semibold text-white">Walkie-Talkie</span>
            </div>
            <StatusBadge
              variant={isWalkieActive ? "online" : "offline"}
              animated={isWalkieActive}
            />
          </div>
          <p className="text-xs text-white/60">Stream audio directly to rover</p>
          <button
            type="button"
            onClick={() => void toggleWalkieTalkie()}
            disabled={!isConnected || isWalkieStarting}
            data-testid="walkie-toggle"
            className={`w-full py-2 px-4 rounded-lg font-semibold transition-all duration-200 ${
              isWalkieActive
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isWalkieStarting ? "Starting…" : isWalkieActive ? "Stop" : "Start"}
          </button>
          {isWalkieActive && (
            <div>
              <div className="flex justify-between text-xs text-white/60 mb-1">
                <span>Audio Level</span>
                <span>{Math.round(walkieAudioLevel * 100)}%</span>
              </div>
              <div className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-100"
                  style={{ width: `${Math.min(100, walkieAudioLevel * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="text-xs text-white/40 space-y-1">
          <p>• <strong>Voice Commands:</strong> private browser capture and final results</p>
          <p>• <strong>Walkie-Talkie:</strong> direct audio streaming for communication</p>
          <p>• <strong>TTS:</strong> manually send text for the rover to speak</p>
        </div>
      </div>
    </DraggablePanel>
  );
};

export default VoiceControls;
