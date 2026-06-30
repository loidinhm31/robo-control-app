// Socket.IO event types — web_bridge/src/main.rs is source of truth

export type AuthErrorReason =
  | "invalid_credentials"
  | "token_expired"
  | "rate_limited"
  | "idle_timeout";

export interface AuthErrorEvent {
  reason: AuthErrorReason;
}

import type { VideoFrame } from "./telemetry";
import type { DetectionFrame, TrackingTelemetry } from "./tracking";
import type { WebArmCommand, WebRoverCommand, WebTrackingCommand } from "./commands";
import type { SpeechTranscription } from "./voice";
import type { SystemMetrics } from "./performance";
import type { FleetStatus, FleetSelectCommand, ActiveRoversStatus } from "./fleet";

export interface LegacyAudioFrameEvent {
  timestamp: number;
  frame_id: number;
  sample_rate: number;
  channels: number;
  format: string;
  data: number[];
}

export interface OriginAudioFrameEvent extends LegacyAudioFrameEvent {
  capture_timestamp_ms: number;
  stream_id: string;
  sample_count: number;
  entity_id?: string | null;
}

export interface BrowserAudioFrameMetadata {
  protocol_version: 1;
  timestamp: number;
  capture_timestamp_ms: number;
  stream_id: string;
  frame_id: number;
  sample_rate: number;
  channels: number;
  sample_count: number;
  duration_ms: number;
  format: "s16le";
  entity_id?: string | null;
  data?: never;
}

export type AudioBinaryPayload =
  | ArrayBuffer
  | ArrayBufferView
  | Blob
  | number[]
  | null
  | undefined;

export type AudioFrameEvent =
  | LegacyAudioFrameEvent
  | OriginAudioFrameEvent
  | BrowserAudioFrameMetadata;

export interface ServerToClientEvents {
  video_frame: (frame: Omit<VideoFrame, "data">, data: ArrayBuffer | Uint8Array) => void;
  audio_frame: (frame: AudioFrameEvent, binaryData?: AudioBinaryPayload) => void;
  detections: (frame: DetectionFrame) => void;
  tracked_detections: (frame: DetectionFrame) => void;
  tracking_telemetry: (telemetry: TrackingTelemetry) => void;
  servo_telemetry: (telemetry: TrackingTelemetry) => void;
  transcription: (data: SpeechTranscription) => void;
  performance_metrics: (metrics: SystemMetrics) => void;
  fleet_status: (status: FleetStatus) => void;
  active_rovers_status: (status: ActiveRoversStatus) => void;
}

export interface ClientToServerEvents {
  arm_command: (command: WebArmCommand) => void;
  rover_command: (command: WebRoverCommand) => void;
  tracking_command: (command: WebTrackingCommand) => void;
  camera_control: (control: { command: string }) => void;
  stream_control: (control: { command: "start" | "stop"; video_enabled: boolean; target_fps?: number }) => void;
  audio_control: (control: { command: string }) => void;
  tts_command: (command: { text: string }) => void;
  audio_stream: (data: { audio_data: number[] }) => void;
  performance_control: (control: { enabled: boolean }) => void;
  fleet_select: (command: FleetSelectCommand) => void;
}
