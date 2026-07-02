// Speech recognition and voice command types

export type SttProfile = "en-vad-offline" | "vi-vad-offline";
export type SttState = "loading" | "ready" | "error";
export type SttSourceKind = "browser" | "rover";

export interface SpeechTranscription {
  text: string;
  confidence?: number | null;
  language: string;
  duration_ms: number;
  timestamp: number;
  utterance_id: string;
  stream_id: string;
  source_kind: SttSourceKind;
  entity_id: string | null;
  target_entity_id: string;
  profile: SttProfile;
}

export interface SttStatus {
  state: SttState;
  profile: SttProfile;
  language: string;
  timestamp: number;
  error: string | null;
}

export type VoiceCommandControl =
  | {
      command: "start";
      stream_id: string;
      sample_rate: number;
      channels: number;
    }
  | {
      command: "stop";
      stream_id: string;
    };

export interface VoiceCommandAudioFrame {
  stream_id: string;
  frame_id: number;
  sample_rate: number;
  channels: number;
  sample_count: number;
  audio_data: number[];
}

export interface SpeechStats {
  total_transcriptions: number;
  avg_confidence: number;
  avg_processing_time_ms: number;
  failed_transcriptions: number;
}

if (false) {
  const browserFixture = {
    text: "move forward",
    confidence: null,
    language: "en",
    duration_ms: 1200,
    timestamp: 1720000000000,
    utterance_id: "utt-browser-1",
    stream_id: "stream-browser-1",
    source_kind: "browser",
    entity_id: null,
    target_entity_id: "rover-kiwi",
    profile: "en-vad-offline",
  } satisfies SpeechTranscription;

  const roverFixture = {
    text: "turn left",
    confidence: 0.87,
    language: "en",
    duration_ms: 1400,
    timestamp: 1720000000100,
    utterance_id: "utt-rover-1",
    stream_id: "stream-rover-1",
    source_kind: "rover",
    entity_id: "rover-alpha",
    target_entity_id: "rover-alpha",
    profile: "en-vad-offline",
  } satisfies SpeechTranscription;

  const readyStatus = {
    state: "ready",
    profile: "vi-vad-offline",
    language: "vi",
    timestamp: 1720000000200,
    error: null,
  } satisfies SttStatus;

  const startControl = {
    command: "start",
    stream_id: "stream-browser-1",
    sample_rate: 48000,
    channels: 1,
  } satisfies VoiceCommandControl;

  const audioFrame = {
    stream_id: "stream-browser-1",
    frame_id: 0,
    sample_rate: 48000,
    channels: 1,
    sample_count: 2400,
    audio_data: [0, 0.5, -0.5],
  } satisfies VoiceCommandAudioFrame;

  void [browserFixture, roverFixture, readyStatus, startControl, audioFrame];
}
