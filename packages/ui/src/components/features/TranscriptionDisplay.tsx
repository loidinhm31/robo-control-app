import React, { useState } from "react";
import type {
  SpeechTranscription,
  SttStatus,
} from "@robo-fleet/shared/types";
import { ChevronDown, Mic, MicOff, Volume2 } from "lucide-react";
import { DraggablePanel } from "../organisms";
import { StatusBadge } from "../atoms";

interface TranscriptionDisplayProps {
  transcriptions: readonly SpeechTranscription[];
  sttStatus: SttStatus | null;
  isAudioActive: boolean;
  maxHistory?: number;
  onStartAudio?: () => void;
  onStopAudio?: () => void;
}

function confidenceColor(confidence: number | null | undefined): string {
  if (confidence == null) return "text-slate-500";
  if (confidence >= 0.8) return "text-green-400";
  if (confidence >= 0.6) return "text-yellow-400";
  return "text-orange-400";
}

function confidenceBadge(confidence: number | null | undefined): string {
  if (confidence == null) return "bg-slate-500/20 text-slate-400";
  if (confidence >= 0.8) return "bg-green-500/20 text-green-400";
  if (confidence >= 0.6) return "bg-yellow-500/20 text-yellow-400";
  return "bg-orange-500/20 text-orange-400";
}

function entityLabel(transcription: SpeechTranscription): string {
  return transcription.entity_id ?? "unknown rover";
}

export const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({
  transcriptions,
  sttStatus,
  isAudioActive,
  maxHistory = 5,
  onStartAudio,
  onStopAudio,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const roverHistory = transcriptions
    .filter((item) => item.source_kind === "rover")
    .slice(0, maxHistory);
  const latest = roverHistory[0] ?? null;

  const collapsedContent = (
    <button className="group flex items-center gap-2 px-3 py-1.5 bg-slate-900/95 backdrop-blur-md border border-slate-700/50 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 drag-handle cursor-move">
      {sttStatus?.state === "ready" ? (
        <>
          <Mic className="w-3.5 h-3.5 text-green-400" />
          <span className="text-[10px] font-bold text-green-400 uppercase tracking-wide">
            STT ready
          </span>
        </>
      ) : (
        <>
          <MicOff className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            STT {sttStatus?.state ?? "unknown"}
          </span>
        </>
      )}
      <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-slate-300" />
    </button>
  );

  return (
    <DraggablePanel
      title="Fleet Speech Transcription"
      isVisible={isVisible}
      onToggleVisible={() => setIsVisible(!isVisible)}
      collapsedContent={collapsedContent}
      initialPosition={{ x: 0, y: 70 }}
      className="w-96 max-h-[40vh]"
      contentClassName="flex-1 overflow-y-auto custom-scrollbar p-0"
      showControls={true}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-700/50 bg-slate-800/90 -mt-4">
        <div className="flex items-center gap-1.5">
          <StatusBadge
            variant={sttStatus?.state === "ready" ? "online" : "offline"}
            label={sttStatus?.state ?? "Unknown"}
            animated={sttStatus?.state === "loading"}
          />
          <span className="text-[10px] text-slate-500 font-mono">
            {sttStatus ? `${sttStatus.profile} · ${sttStatus.language}` : "status unavailable"}
          </span>
        </div>

        {onStartAudio && onStopAudio && (
          <button
            onClick={isAudioActive ? onStopAudio : onStartAudio}
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all ${
              isAudioActive
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
            }`}
          >
            Rover audio {isAudioActive ? "Stop" : "Start"}
          </button>
        )}
      </div>

      {latest && (
        <div className="px-2.5 py-2 border-b border-slate-700/30 bg-slate-800/30" data-testid="latest-rover-transcription">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-mono">
            <span className="rounded bg-syntax-blue/15 px-1.5 py-0.5 text-syntax-blue" data-testid="rover-entity-badge">
              {entityLabel(latest)}
            </span>
            <span className="text-slate-500">{latest.language} · {latest.profile}</span>
          </div>
          <p className="text-xs font-medium text-slate-100 leading-tight mb-1">
            {latest.text}
          </p>
          <div className="flex items-center gap-1.5 text-[10px]">
            {latest.confidence != null && (
              <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${confidenceBadge(latest.confidence)}`}>
                {(latest.confidence * 100).toFixed(0)}%
              </span>
            )}
            <span className="text-slate-500">
              {new Date(latest.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {latest.duration_ms > 0 && (
              <span className="text-slate-500 flex items-center gap-0.5">
                <Volume2 className="w-2.5 h-2.5" />
                {(latest.duration_ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>
      )}

      {roverHistory.length > 1 && (
        <div className="divide-y divide-slate-700/20" aria-label="Fleet rover transcript history">
          {roverHistory.slice(1).map((item, index) => (
            <div
              key={item.utterance_id}
              className="px-2.5 py-1.5 hover:bg-slate-800/20 transition-colors"
              style={{ opacity: Math.max(0.5, 1 - index * 0.15) }}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-mono mb-0.5">
                <span className="text-syntax-blue">{entityLabel(item)}</span>
                <span className="text-slate-600">{item.language} · {item.profile}</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-tight mb-0.5 line-clamp-2">
                {item.text}
              </p>
              <div className="flex items-center gap-1.5">
                {item.confidence != null && (
                  <span className={`text-[10px] font-bold ${confidenceColor(item.confidence)}`}>
                    {(item.confidence * 100).toFixed(0)}%
                  </span>
                )}
                <span className="text-[10px] text-slate-600">
                  {new Date(item.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {roverHistory.length === 0 && (
        <div className="px-2.5 py-6 text-center">
          <Mic className="w-8 h-8 text-slate-600 mx-auto mb-1.5 opacity-50" />
          <p className="text-[10px] text-slate-500 font-medium">
            Waiting for rover-origin final transcripts.
          </p>
        </div>
      )}
    </DraggablePanel>
  );
};

export default TranscriptionDisplay;
