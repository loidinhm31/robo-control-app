import type { AudioFrameEvent } from "@robo-fleet/shared/types";

const MIN_SAMPLE_RATE = 8_000;
const MAX_SAMPLE_RATE = 192_000;
const MAX_CHANNELS = 8;
const MAX_DURATION_MS = 1_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface NormalizedAudioFrame {
  streamId?: string;
  entityId?: string;
  frameId: number;
  captureTimestampMs: number;
  sampleRate: number;
  channels: number;
  sampleCount: number;
  durationMs: number;
  pcmBytes: Uint8Array;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const safeInteger = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return value as number;
};

const optionalString = (value: unknown, field: string): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new Error(`${field} must be a non-empty bounded string`);
  }
  return value;
};

const normalizeBytes = (value: unknown, maximumBytes: number): Uint8Array => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("audio data must be a non-empty byte array");
  }
  if (value.length > maximumBytes) throw new Error("audio data exceeds maximum frame size");
  for (const byte of value) {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new Error("audio data contains a value outside byte range");
    }
  }
  return Uint8Array.from(value);
};

export const normalizeLegacyAudioFrame = (
  input: AudioFrameEvent | unknown,
): NormalizedAudioFrame => {
  if (!isRecord(input)) throw new Error("audio frame must be an object");

  const frameId = safeInteger(input.frame_id, "frame_id");
  const timestamp = safeInteger(input.timestamp, "timestamp");
  const captureTimestampMs = input.capture_timestamp_ms === undefined
    ? timestamp
    : safeInteger(input.capture_timestamp_ms, "capture_timestamp_ms");
  const sampleRate = safeInteger(input.sample_rate, "sample_rate");
  const channels = safeInteger(input.channels, "channels");
  if (sampleRate < MIN_SAMPLE_RATE || sampleRate > MAX_SAMPLE_RATE) {
    throw new Error(`unsupported sample_rate: ${sampleRate}`);
  }
  if (channels < 1 || channels > MAX_CHANNELS) {
    throw new Error(`unsupported channels: ${channels}`);
  }
  if (input.format !== "s16le") throw new Error(`unsupported format: ${String(input.format)}`);

  const maximumBytes = sampleRate * channels * 2 * MAX_DURATION_MS / 1_000;
  const pcmBytes = normalizeBytes(input.data, maximumBytes);
  if (pcmBytes.byteLength % 2 !== 0) throw new Error("s16le payload length must be even");
  const derivedSampleCount = pcmBytes.byteLength / 2;
  const sampleCount = input.sample_count === undefined
    ? derivedSampleCount
    : safeInteger(input.sample_count, "sample_count");
  if (sampleCount !== derivedSampleCount) throw new Error("sample_count does not match payload");
  if (sampleCount === 0 || sampleCount % channels !== 0) {
    throw new Error("sample_count must contain complete interleaved channel frames");
  }

  const durationMs = sampleCount * 1_000 / (sampleRate * channels);
  if (durationMs > MAX_DURATION_MS) throw new Error("audio frame duration exceeds maximum");

  const streamId = optionalString(input.stream_id, "stream_id");
  if (streamId !== undefined && !UUID_PATTERN.test(streamId)) {
    throw new Error("stream_id must be a UUID");
  }

  return {
    streamId,
    entityId: optionalString(input.entity_id, "entity_id"),
    frameId,
    captureTimestampMs,
    sampleRate,
    channels,
    sampleCount,
    durationMs,
    pcmBytes,
  };
};
