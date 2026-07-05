import type {
  TtsCommandAck,
  TtsCommandResult,
  TtsRuntimeConfig,
  VoiceReasonCode,
  VoiceStatus,
} from "@robo-fleet/shared/types";

export interface VoiceChoiceOption<TValue> {
  value: TValue;
  label: string;
  helper?: string;
}

export interface VoiceAlertItem {
  id: string;
  tone: "warning" | "error";
  liveMode: "polite" | "assertive";
  title: string;
  message: string;
  entityId?: string;
  detail?: string | null;
}

export const TTS_SPEAKER_OPTIONS: readonly VoiceChoiceOption<number>[] = [
  { value: 0, label: "F1" },
  { value: 1, label: "F2" },
  { value: 2, label: "F3" },
  { value: 3, label: "F4" },
  { value: 4, label: "F5" },
  { value: 5, label: "M1" },
  { value: 6, label: "M2" },
  { value: 7, label: "M3" },
  { value: 8, label: "M4" },
  { value: 9, label: "M5" },
] as const;

export const TTS_QUALITY_OPTIONS: readonly VoiceChoiceOption<number>[] = [
  { value: 5, label: "Fast", helper: "5 steps" },
  { value: 8, label: "Balanced", helper: "8 steps" },
  { value: 12, label: "Quality", helper: "12 steps" },
] as const;

export function speakerLabel(speakerId: number): string {
  return TTS_SPEAKER_OPTIONS.find((option) => option.value === speakerId)?.label
    ?? `SID ${speakerId}`;
}

export function qualityLabel(numSteps: number): string {
  return TTS_QUALITY_OPTIONS.find((option) => option.value === numSteps)?.label
    ?? `${numSteps} steps`;
}

export function cloneTtsConfig(config: TtsRuntimeConfig): TtsRuntimeConfig {
  return {
    language: config.language,
    speaker_id: config.speaker_id,
    speed: config.speed,
    num_steps: config.num_steps,
    volume: config.volume,
  };
}

export function voiceStatusSummary(status: VoiceStatus | null): string | null {
  if (!status) return null;
  const base = `${status.entity_id} ${status.state.toUpperCase()} on R${status.applied_revision}`;
  if (status.state === "speaking" && status.active_command_id) {
    return `${base} (${status.active_command_id.slice(0, 8)})`;
  }
  return base;
}

function describeReason(reasonCode?: VoiceReasonCode, detail?: string | null): string {
  switch (reasonCode) {
    case "walkie_active":
      return "Live walkie-talkie has priority.";
    case "interrupted_by_walkie":
      return "Live walkie-talkie interrupted rover speech.";
    case "stale_revision":
      return "The UI config was stale. Waiting for the latest server revision.";
    case "queue_full":
      return "The rover voice queue is full.";
    case "voice_not_ready":
      return "Voice output is not ready yet.";
    case "invalid_config":
      return "The server rejected the requested TTS config.";
    case "invalid_command":
      return "The server rejected the requested TTS command.";
    case "playback_failed":
      return "Audio playback failed on the rover.";
    case "playback_unavailable":
      return "Rover playback hardware is unavailable.";
    case "synthesis_failed":
      return "Speech synthesis failed on the rover.";
    case "cancelled":
      return "Speech was cancelled before completion.";
    default:
      return detail?.trim() || "The rover returned an unknown voice error.";
  }
}

export function buildAckAlert(ack: TtsCommandAck | null): VoiceAlertItem | null {
  if (!ack || ack.state !== "rejected") return null;
  const message = ack.reason_code === "walkie_active"
    ? "TTS not started: live walkie-talkie has priority."
    : "TTS request was rejected by the rover.";
  return {
    id: `${ack.command_id}:${ack.state}:${ack.reason_code ?? "unknown"}`,
    tone: ack.reason_code === "walkie_active" ? "warning" : "error",
    liveMode: "assertive",
    title: "Rover TTS rejected",
    message,
    entityId: ack.target_entity_id,
    detail: describeReason(ack.reason_code, ack.detail),
  };
}

export function buildResultAlert(
  result: TtsCommandResult | null,
): VoiceAlertItem | null {
  if (!result || result.state === "completed") return null;

  if (
    result.state === "interrupted" &&
    result.reason_code === "interrupted_by_walkie"
  ) {
    return {
      id: `${result.command_id}:${result.state}:${result.reason_code}`,
      tone: "warning",
      liveMode: "assertive",
      title: "Walkie-talkie took priority",
      message: "Rover speech stopped because live walkie-talkie started.",
      entityId: result.entity_id,
      detail: describeReason(result.reason_code, result.detail),
    };
  }

  return {
    id: `${result.command_id}:${result.state}:${result.reason_code ?? "unknown"}`,
    tone: result.state === "rejected" ? "warning" : "error",
    liveMode: "assertive",
    title: result.state === "rejected"
      ? "Rover TTS rejected"
      : result.state === "interrupted"
        ? "Rover TTS interrupted"
        : "Rover TTS failed",
    message: result.state === "rejected"
      ? "The rover did not accept the speech request."
      : result.state === "interrupted"
        ? "Rover speech stopped before completion."
        : "Rover speech failed before completion.",
    entityId: result.entity_id,
    detail: describeReason(result.reason_code, result.detail),
  };
}
