import { describe, expect, it } from "vitest";
import { normalizeAudioFrame, normalizeLegacyAudioFrame } from "./audio-frame";

const legacyFrame = () => ({
  timestamp: 1_717_000_000_000,
  frame_id: 4,
  sample_rate: 16_000,
  channels: 1,
  format: "s16le",
  data: [0, 128, 255, 127],
});

const binaryMetadata = () => ({
  protocol_version: 1 as const,
  timestamp: 1_717_000_000_000,
  capture_timestamp_ms: 1_716_999_999_950,
  stream_id: "550e8400-e29b-41d4-a716-446655440000",
  frame_id: 4,
  sample_rate: 16_000,
  channels: 1,
  sample_count: 2,
  duration_ms: 0.125,
  format: "s16le" as const,
  entity_id: "rover-kiwi",
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

describe("normalizeAudioFrame", () => {
  it("keeps legacy JSON compatibility when no attachment is present", async () => {
    const result = await normalizeAudioFrame(legacyFrame());

    expect(result.pcmBytes).toEqual(new Uint8Array([0, 128, 255, 127]));
  });

  it("normalizes an ArrayBuffer attachment", async () => {
    const buffer = new Uint8Array([0, 128, 255, 127]).buffer;
    const result = await normalizeAudioFrame(binaryMetadata(), buffer);

    expect(result.streamId).toBe(binaryMetadata().stream_id);
    expect(result.entityId).toBe("rover-kiwi");
    expect(result.pcmBytes).toEqual(new Uint8Array([0, 128, 255, 127]));
    expect(result.pcmBytes.buffer).toBe(buffer);
  });

  it("normalizes a bounded typed-array view without copying", async () => {
    const backing = new Uint8Array([9, 9, 0, 128, 255, 127, 9]);
    const view = new Uint8Array(backing.buffer, 2, 4);
    const result = await normalizeAudioFrame(binaryMetadata(), view);

    expect(result.pcmBytes).toEqual(new Uint8Array([0, 128, 255, 127]));
    expect(result.pcmBytes.buffer).toBe(backing.buffer);
    expect(result.pcmBytes.byteOffset).toBe(2);
  });

  it("normalizes Blob and transitional number-array attachments", async () => {
    const bytes = [0, 128, 255, 127];
    const blobResult = await normalizeAudioFrame(
      binaryMetadata(),
      new Blob([new Uint8Array(bytes)]),
    );
    const arrayResult = await normalizeAudioFrame(binaryMetadata(), bytes);

    expect(blobResult.pcmBytes).toEqual(new Uint8Array(bytes));
    expect(arrayResult.pcmBytes).toEqual(new Uint8Array(bytes));
  });

  it.each([
    ["missing attachment", binaryMetadata(), undefined],
    ["odd attachment", binaryMetadata(), new Uint8Array([0, 1, 2])],
    ["sample mismatch", binaryMetadata(), new Uint8Array([0, 1])],
    ["invalid byte", binaryMetadata(), [0, 256, 0, 0]],
    ["duration mismatch", { ...binaryMetadata(), duration_ms: 1 }, new Uint8Array(4)],
    ["unsupported version", { ...binaryMetadata(), protocol_version: 2 }, new Uint8Array(4)],
    ["attachment without version", { ...binaryMetadata(), protocol_version: undefined }, new Uint8Array(4)],
    ["embedded JSON data", { ...binaryMetadata(), data: [0, 1, 2, 3] }, new Uint8Array(4)],
  ])("rejects %s", async (_name, metadata, attachment) => {
    await expect(normalizeAudioFrame(metadata, attachment)).rejects.toThrow();
  });

  it("accepts sub-millisecond duration rounding", async () => {
    const result = await normalizeAudioFrame(
      { ...binaryMetadata(), duration_ms: 0.5 },
      new Uint8Array(4),
    );

    expect(result.durationMs).toBe(0.125);
  });
});
