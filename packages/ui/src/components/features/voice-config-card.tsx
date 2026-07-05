import React from "react";
import type { TtsLanguage, TtsRuntimeConfig, VoiceStatus } from "@robo-fleet/shared/types";
import { Languages, SlidersHorizontal, Users, Volume2 } from "lucide-react";
import { StatusBadge } from "../atoms";
import {
  qualityLabel,
  speakerLabel,
  TTS_QUALITY_OPTIONS,
  TTS_SPEAKER_OPTIONS,
  voiceStatusSummary,
} from "./voice-controls-helpers";

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export interface VoiceConfigCardProps {
  activeRovers: number;
  appliedRovers: number;
  config: TtsRuntimeConfig | null;
  desiredRevision: number | null;
  pendingRevision: number | null;
  selectedStatus: VoiceStatus | null;
  disabled: boolean;
  onLanguageChange: (language: TtsLanguage) => void;
  onSpeakerChange: (speakerId: number) => void;
  onQualityChange: (numSteps: number) => void;
  onSpeedChange: (speed: number) => void;
  onVolumeChange: (volume: number) => void;
}

function voiceStatusVariant(
  status: VoiceStatus | null,
): "disabled" | "offline" | "online" | "tracking" | "warning" {
  if (!status) return "disabled";
  switch (status.state) {
    case "ready":
      return "online";
    case "speaking":
      return "tracking";
    case "loading":
      return "warning";
    case "error":
      return "warning";
    case "unavailable":
      return "disabled";
    default:
      return "offline";
  }
}

interface ChoiceGroupProps<TValue> {
  label: string;
  value: TValue | null;
  disabled: boolean;
  options: readonly { value: TValue; label: string; helper?: string }[];
  onSelect: (value: TValue) => void;
  columnsClassName?: string;
}

function ChoiceGroup<TValue extends string | number>({
  label,
  value,
  disabled,
  options,
  onSelect,
  columnsClassName = "grid-cols-3",
}: ChoiceGroupProps<TValue>): React.ReactElement {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/65">
        {label}
      </p>
      <div className={`grid gap-2 ${columnsClassName}`}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={`${label}-${option.label}`}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(option.value)}
              data-testid={`${slugify(label)}-${slugify(option.label)}`}
              className={`rounded-xl border px-3 py-2 text-left transition ${
                selected
                  ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                  : "border-slate-700/70 bg-slate-900/60 text-white/70 hover:border-slate-500"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <div className="text-sm font-semibold">{option.label}</div>
              {option.helper && (
                <div className="text-[11px] text-white/45">{option.helper}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface SliderFieldProps {
  testId: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  helperText: string;
  disabled: boolean;
  onChange: (value: number) => void;
}

const SliderField: React.FC<SliderFieldProps> = ({
  testId,
  label,
  value,
  min,
  max,
  step,
  format,
  helperText,
  disabled,
  onChange,
}) => (
  <div className="space-y-2 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-3">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/65">
        {label}
      </p>
      <span className="text-sm font-mono font-semibold text-cyan-200">
        {format(value)}
      </span>
    </div>
    <input
      data-testid={testId}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      className="glass-slider w-full"
    />
    <div className="flex items-center justify-between text-[11px] text-white/45">
      <span>{format(min)}</span>
      <span>{helperText}</span>
      <span>{format(max)}</span>
    </div>
  </div>
);

export const VoiceConfigCard: React.FC<VoiceConfigCardProps> = ({
  activeRovers,
  appliedRovers,
  config,
  desiredRevision,
  pendingRevision,
  selectedStatus,
  disabled,
  onLanguageChange,
  onSpeakerChange,
  onQualityChange,
  onSpeedChange,
  onVolumeChange,
}) => {
  const summaryText = selectedStatus
    ? voiceStatusSummary(selectedStatus)
    : "Waiting for authoritative rover voice state.";

  return (
    <div className="glass-card-light rounded-xl p-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-orange-400" />
            <h3 className="text-sm font-semibold text-white">Global TTS Config</h3>
          </div>
          <p className="text-xs text-white/55">{summaryText}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            variant={pendingRevision === null ? "success" : "warning"}
            className="shrink-0"
            label={
              pendingRevision === null
                ? `Desired R${desiredRevision ?? 0}`
                : `Pending R${pendingRevision}`
            }
          />
          <StatusBadge
            variant={appliedRovers === activeRovers ? "online" : "warning"}
            label={`Applied ${appliedRovers}/${activeRovers}`}
          />
          <StatusBadge
            variant={voiceStatusVariant(selectedStatus)}
            label={`${activeRovers} active`}
          />
        </div>
      </div>

      {config ? (
        <div className="space-y-3">
          <ChoiceGroup
            label="Language"
            value={config.language}
            disabled={disabled}
            options={[
              { value: "en", label: "English" },
              { value: "vi", label: "Vietnamese" },
            ]}
            columnsClassName="grid-cols-2"
            onSelect={onLanguageChange}
          />

          <ChoiceGroup
            label={`Voice (${speakerLabel(config.speaker_id)})`}
            value={config.speaker_id}
            disabled={disabled}
            options={TTS_SPEAKER_OPTIONS}
            columnsClassName="grid-cols-5"
            onSelect={onSpeakerChange}
          />

          <div className="grid gap-3 md:grid-cols-2">
            <SliderField
              testId="tts-speed-slider"
              label="Speed"
              value={config.speed}
              min={0.5}
              max={2}
              step={0.05}
              format={(value) => `${value.toFixed(2)}x`}
              helperText="0.50x to 2.00x"
              disabled={disabled}
              onChange={onSpeedChange}
            />
            <SliderField
              testId="tts-volume-slider"
              label="Volume"
              value={config.volume}
              min={0}
              max={1}
              step={0.05}
              format={(value) => value.toFixed(2)}
              helperText="0.00 to 1.00"
              disabled={disabled}
              onChange={onVolumeChange}
            />
          </div>

          <div className="space-y-2 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-cyan-300" />
                <p className="text-xs font-semibold uppercase tracking-wide text-white/65">
                  Quality
                </p>
              </div>
              <span className="text-sm font-semibold text-cyan-100">
                {qualityLabel(config.num_steps)}
              </span>
            </div>
            <ChoiceGroup
              label="Quality preset"
              value={config.num_steps}
              disabled={disabled}
              options={TTS_QUALITY_OPTIONS}
              columnsClassName="grid-cols-3"
              onSelect={onQualityChange}
            />
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-slate-700/60 bg-slate-900/50 p-3 text-xs text-white/55">
            <div className="mt-0.5 flex items-center gap-1 text-cyan-300">
              <Languages className="h-3.5 w-3.5" />
              <Users className="h-3.5 w-3.5" />
            </div>
            <p>
              Server-authoritative config. Sends full updates with the current base
              revision and waits for rover convergence before clearing pending state.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-3 text-xs text-white/55">
          Waiting for the server to publish the authoritative TTS configuration.
        </div>
      )}
    </div>
  );
};
