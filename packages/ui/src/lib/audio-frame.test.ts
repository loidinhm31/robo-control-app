import { describe, expect, it } from "vitest";
import { normalizeLegacyAudioFrame } from "./audio-frame";

const legacyFrame = () => ({
  timestamp: 1_717_000_000_000,
  frame_id: 4,
  sample_rate: 16_000,
  channels: 1,
  format: "s16le",
  data: [0, 128, 255, 127],
});

describe("normalizeLegacyAudioFrame", () => {
  it("normalizes legacy JSON bytes and derives missing origin fields", () => {
    const result = normalizeLegacyAudioFrame(legacyFrame());

    expect(result.streamId).toBeUndefined();
    expect(result.captureTimestampMs).toBe(1_717_000_000_000);
    expect(result.sampleCount).toBe(2);
    expect(result.pcmBytes).toEqual(new Uint8Array([0, 128, 255, 127]));
  });

  it("preserves capture identity from the current backend payload", () => {
    const result = normalizeLegacyAudioFrame({
      ...legacyFrame(),
      stream_id: "550e8400-e29b-41d4-a716-446655440000",
      capture_timestamp_ms: 1_716_999_999_950,
      sample_count: 2,
      entity_id: "rover-kiwi",
    });

    expect(result.streamId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(result.captureTimestampMs).toBe(1_716_999_999_950);
    expect(result.entityId).toBe("rover-kiwi");
  });

  it.each([
    ["format", { format: "f32le" }],
    ["sample rate", { sample_rate: 7_999 }],
    ["channels", { channels: 0 }],
    ["odd payload", { data: [0, 1, 2] }],
    ["payload mismatch", { sample_count: 3 }],
    ["invalid byte", { data: [0, 256] }],
    ["invalid stream", { stream_id: "not-a-uuid" }],
  ])("rejects invalid %s metadata", (_name, override) => {
    expect(() => normalizeLegacyAudioFrame({ ...legacyFrame(), ...override })).toThrow();
  });

  it("rejects frames exceeding the bounded duration", () => {
    expect(() => normalizeLegacyAudioFrame({
      ...legacyFrame(),
      sample_rate: 8_000,
      data: new Array(16_002).fill(0),
    })).toThrow("exceeds maximum frame size");
  });
});
