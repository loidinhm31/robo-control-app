// Version-stable edge-voice contracts mirrored from robo_rover_lib.

export type TtsLanguage = "en" | "vi";
export type TtsPriority = "low" | "normal" | "high" | "emergency";

export interface TtsRuntimeConfig {
  language: TtsLanguage;
  speaker_id: number;
  speed: number;
  num_steps: number;
  volume: number;
}

export interface TtsCommandInput {
  text: string;
}

export interface TtsCommand {
  command_id: string;
  text: string;
  timestamp: number;
  priority: TtsPriority;
}

export interface TtsConfigCommand {
  revision: number;
  config: TtsRuntimeConfig;
}

export interface TtsConfigUpdate {
  base_revision: number;
  config: TtsRuntimeConfig;
}

export type VoiceReasonCode =
  | "invalid_command"
  | "invalid_config"
  | "stale_revision"
  | "queue_full"
  | "voice_not_ready"
  | "walkie_active"
  | "interrupted_by_walkie"
  | "cancelled"
  | "synthesis_failed"
  | "playback_failed"
  | "playback_unavailable"
  | "internal_error";

export type TtsAckState = "accepted" | "rejected";

export interface TtsCommandAck {
  command_id: string;
  target_entity_id: string;
  state: TtsAckState;
  timestamp: number;
  reason_code?: VoiceReasonCode;
  detail?: string;
}

export type TtsResultState = "completed" | "rejected" | "interrupted" | "failed";

export interface TtsCommandResult {
  command_id: string;
  entity_id: string;
  state: TtsResultState;
  timestamp: number;
  reason_code?: VoiceReasonCode;
  detail?: string;
}

export type VoiceState = "loading" | "ready" | "speaking" | "error" | "unavailable";

export interface VoiceStatus {
  entity_id: string;
  state: VoiceState;
  applied_revision: number;
  applied_config: TtsRuntimeConfig;
  active_command_id?: string;
  timestamp: number;
  reason_code?: VoiceReasonCode;
  detail?: string;
}

export interface TtsConfigState {
  desired_revision: number;
  desired_config: TtsRuntimeConfig;
  applied_rovers: number;
  active_rovers: number;
  rovers: VoiceStatus[];
  timestamp: number;
}

export type PlaybackSource = "tts" | "walkie";
export type PlaybackStateKind = "idle" | "active" | "unavailable";

export interface PlaybackState {
  entity_id: string;
  state: PlaybackStateKind;
  source?: PlaybackSource;
  command_id?: string;
  timestamp: number;
  reason_code?: VoiceReasonCode;
  detail?: string;
}

function verifyTtsContracts(): void {
  const defaultConfig = {
    language: "en",
    speaker_id: 5,
    speed: 1.0,
    num_steps: 8,
    volume: 0.8,
  } satisfies TtsRuntimeConfig;

  const command = {
    command_id: "550e8400-e29b-41d4-a716-446655440000",
    text: "Hello rover",
    timestamp: 1720000000000,
    priority: "normal",
  } satisfies TtsCommand;

  const configCommand = {
    revision: 0,
    config: defaultConfig,
  } satisfies TtsConfigCommand;

  const configUpdate = {
    base_revision: 0,
    config: defaultConfig,
  } satisfies TtsConfigUpdate;

  const accepted = {
    command_id: command.command_id,
    target_entity_id: "rover-kiwi",
    state: "accepted",
    timestamp: command.timestamp,
  } satisfies TtsCommandAck;

  const rejected = {
    command_id: command.command_id,
    entity_id: "rover-kiwi",
    state: "rejected",
    timestamp: command.timestamp,
    reason_code: "queue_full",
    detail: "voice queue saturated",
  } satisfies TtsCommandResult;

  const interrupted = {
    command_id: command.command_id,
    entity_id: "rover-kiwi",
    state: "interrupted",
    timestamp: command.timestamp,
    reason_code: "interrupted_by_walkie",
    detail: "live walkie started",
  } satisfies TtsCommandResult;

  const ready = {
    entity_id: "rover-kiwi",
    state: "ready",
    applied_revision: 0,
    applied_config: defaultConfig,
    timestamp: command.timestamp,
  } satisfies VoiceStatus;

  const configState = {
    desired_revision: 0,
    desired_config: defaultConfig,
    applied_rovers: 1,
    active_rovers: 1,
    rovers: [ready],
    timestamp: command.timestamp,
  } satisfies TtsConfigState;

  const playback = {
    entity_id: "rover-kiwi",
    state: "active",
    source: "tts",
    command_id: command.command_id,
    timestamp: command.timestamp,
  } satisfies PlaybackState;

  void [
    defaultConfig,
    command,
    configCommand,
    configUpdate,
    accepted,
    rejected,
    interrupted,
    ready,
    configState,
    playback,
  ];
}

void verifyTtsContracts;
