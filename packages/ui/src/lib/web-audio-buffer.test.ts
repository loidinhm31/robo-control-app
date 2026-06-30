import { describe, expect, it } from "vitest";
import type { NormalizedAudioFrame } from "./audio-frame";
import { createPcmAudioBuffer } from "./web-audio-buffer";

const createContext = (channels: Float32Array[]): AudioContext => ({
  createBuffer: () => ({
    getChannelData: (channel: number) => channels[channel],
  }),
}) as unknown as AudioContext;

const createFrame = (pcmBytes: number[], channels: number): NormalizedAudioFrame => ({
  streamId: "550e8400-e29b-41d4-a716-446655440000",
  entityId: "rover-kiwi",
  frameId: 1,
  captureTimestampMs: 1_000,
  sampleRate: 16_000,
  channels,
  sampleCount: pcmBytes.length / 2,
  durationMs: pcmBytes.length / 2 / channels / 16,
  pcmBytes: new Uint8Array(pcmBytes),
});

describe("createPcmAudioBuffer", () => {
  it("decodes signed little-endian mono samples", () => {
    const channel = new Float32Array(3);
    createPcmAudioBuffer(
      createContext([channel]),
      createFrame([0x00, 0x80, 0x00, 0x00, 0xff, 0x7f], 1),
    );

    expect(Array.from(channel)).toEqual([-1, 0, 32_767 / 32_768]);
  });

  it("deinterleaves multi-channel samples", () => {
    const left = new Float32Array(2);
    const right = new Float32Array(2);
    createPcmAudioBuffer(
      createContext([left, right]),
      createFrame([0x00, 0x40, 0x00, 0xc0, 0x00, 0x20, 0x00, 0xe0], 2),
    );

    expect(Array.from(left)).toEqual([0.5, 0.25]);
    expect(Array.from(right)).toEqual([-0.5, -0.25]);
  });
});
