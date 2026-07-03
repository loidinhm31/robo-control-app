import React from "react";
import type {
  SpeechTranscription,
  SttStatus,
} from "@robo-fleet/shared/types";
import { AlertCircle, Mic, Square } from "lucide-react";
import type { BrowserVoiceCaptureState } from "../../hooks/use-browser-voice-capture";
import { StatusBadge } from "../atoms";

const MAX_VISIBLE_HISTORY = 5;

interface VoiceCommandPanelProps {
  captureState: BrowserVoiceCaptureState;
  audioLevel: number;
  captureError: string | null;
  sttStatus: SttStatus | null;
  selectedTargetEntityId: string | null;
  capturedTargetEntityId: string | null;
  transcriptions: readonly SpeechTranscription[];
  canStart: boolean;
  disabledReason: string | null;
  onToggleCapture: () => Promise<void>;
}

export function sanitizeStatusError(value: string | null): string | null {
  if (!value) return null;
  const sanitized = Array.from(value, (character) => {
    const codePoint = character.charCodeAt(0);
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  }).join("").trim();
  return sanitized ? sanitized.slice(0, 160) : null;
}

function statusLabel(status: SttStatus | null): string {
  if (!status) return "Unknown";
  if (status.state === "ready") return "Ready";
  if (status.state === "loading") return "Loading";
  return "Error";
}

export const VoiceCommandPanel: React.FC<VoiceCommandPanelProps> = ({
  captureState,
  audioLevel,
  captureError,
  sttStatus,
  selectedTargetEntityId,
  capturedTargetEntityId,
  transcriptions,
  canStart,
  disabledReason,
  onToggleCapture,
}) => {
  const isCapturing = captureState === "capturing";
  const isTransitioning =
    captureState === "starting" || captureState === "stopping";
  const targetEntityId = capturedTargetEntityId ?? selectedTargetEntityId;
  const backendError = sanitizeStatusError(sttStatus?.error ?? null);
  const browserHistory = transcriptions
    .filter((item) => item.source_kind === "browser")
    .slice(0, MAX_VISIBLE_HISTORY);

  return (
    <div className="glass-card-light rounded-xl p-3 space-y-3" data-testid="voice-command-panel">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white">Browser Voice Commands</h3>
        </div>
        <StatusBadge
          variant={sttStatus?.state === "ready" ? "online" : "offline"}
          label={statusLabel(sttStatus)}
          animated={sttStatus?.state === "loading" || isCapturing}
        />
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono">
        <dt className="text-slate-500">profile</dt>
        <dd className="text-syntax-cyan text-right" data-testid="stt-profile">
          {sttStatus?.profile ?? "unavailable"}
        </dd>
        <dt className="text-slate-500">language</dt>
        <dd className="text-slate-300 text-right">{sttStatus?.language ?? "—"}</dd>
        <dt className="text-slate-500">capture target</dt>
        <dd className="text-syntax-orange text-right truncate" data-testid="voice-command-target">
          {targetEntityId ?? "none"}
        </dd>
      </dl>

      {(captureError || backendError) && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span className="text-xs text-red-300" role="alert">
            {captureError ?? backendError}
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => void onToggleCapture()}
        disabled={isTransitioning || (!isCapturing && !canStart)}
        className={`w-full py-2 px-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
          isCapturing
            ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
            : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        data-testid="voice-command-toggle"
      >
        {isCapturing ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        {captureState === "starting"
          ? "Starting…"
          : captureState === "stopping"
            ? "Stopping…"
            : isCapturing
              ? "Stop"
              : "Start"}
      </button>

      {!isCapturing && disabledReason && (
        <p className="text-[11px] text-slate-500" data-testid="voice-command-disabled-reason">
          {disabledReason}
        </p>
      )}

      {isCapturing && (
        <div>
          <div className="flex justify-between text-xs text-white/60 mb-1">
            <span>Microphone level</span>
            <span>{Math.round(audioLevel * 100)}%</span>
          </div>
          <div className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-100"
              style={{ width: `${Math.min(100, Math.max(0, audioLevel * 100))}%` }}
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5" aria-label="Private browser transcript history">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">
          Private final transcripts
        </div>
        {browserHistory.length === 0 ? (
          <p className="text-xs text-slate-500">No browser command received.</p>
        ) : (
          browserHistory.map((item) => (
            <div
              key={item.utterance_id}
              className="bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1.5"
            >
              <p className="text-xs text-slate-100">{item.text}</p>
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>{item.language} · {item.profile}</span>
                <span>target {item.target_entity_id}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default VoiceCommandPanel;
