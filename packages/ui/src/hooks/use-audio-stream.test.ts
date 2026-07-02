// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import type { Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioStream, type UseAudioStreamReturn } from "./use-audio-stream";

type SocketHandler = (...args: never[]) => void;

class FakeSocket {
  readonly io = { engine: { transport: { name: "websocket" } } };
  private readonly handlers = new Map<string, Set<SocketHandler>>();

  on(event: string, handler: SocketHandler): this {
    const listeners = this.handlers.get(event) ?? new Set();
    listeners.add(handler);
    this.handlers.set(event, listeners);
    return this;
  }

  off(event: string, handler: SocketHandler): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  dispatch(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args as never[]);
    }
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

class FakeBufferSource {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  readonly starts: number[] = [];
  stopCount = 0;
  disconnectCount = 0;

  connect(): void {}
  start(when: number): void { this.starts.push(when); }
  stop(): void { this.stopCount++; }
  disconnect(): void { this.disconnectCount++; }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static failCreateGain = false;
  readonly destination = {} as AudioDestinationNode;
  readonly sources: FakeBufferSource[] = [];
  currentTime = 10;
  state: AudioContextState = "suspended";
  onstatechange: (() => void) | null = null;
  closeCount = 0;
  resumeCount = 0;

  constructor() { FakeAudioContext.instances.push(this); }

  createGain(): GainNode {
    if (FakeAudioContext.failCreateGain) throw new Error("gain creation failed");
    return { gain: { value: 1 }, connect: vi.fn() } as unknown as GainNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    return {
      type: "lowpass",
      frequency: { value: 0 },
      Q: { value: 0 },
      connect: vi.fn(),
    } as unknown as BiquadFilterNode;
  }

  createBuffer(channels: number, samples: number): AudioBuffer {
    const data = Array.from({ length: channels }, () => new Float32Array(samples));
    return { getChannelData: (channel: number) => data[channel] } as unknown as AudioBuffer;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeBufferSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  async resume(): Promise<void> {
    this.resumeCount++;
    this.state = "running";
    this.onstatechange?.();
  }

  async close(): Promise<void> {
    this.closeCount++;
    this.state = "closed";
  }

  suspendFromBrowser(): void {
    this.state = "suspended";
    this.onstatechange?.();
  }
}

const audioFrame = (frameId: number) => ({
  timestamp: Date.now(),
  frame_id: frameId,
  sample_rate: 16_000,
  channels: 1,
  format: "s16le",
  data: [0, 0],
});

const binaryMetadata = (frameId: number) => ({
  protocol_version: 1 as const,
  timestamp: Date.now(),
  capture_timestamp_ms: Date.now(),
  stream_id: "550e8400-e29b-41d4-a716-446655440000",
  frame_id: frameId,
  sample_rate: 16_000,
  channels: 1,
  sample_count: 800,
  duration_ms: 50,
  format: "s16le" as const,
});

class DeferredBlob extends Blob {
  private readonly pending: Promise<ArrayBuffer>;
  private resolvePending!: (value: ArrayBuffer) => void;

  constructor() {
    super([new Uint8Array(1_600)]);
    this.pending = new Promise((resolve) => { this.resolvePending = resolve; });
  }

  override arrayBuffer(): Promise<ArrayBuffer> { return this.pending; }

  async release(): Promise<void> {
    this.resolvePending(await new Blob([new Uint8Array(1_600)]).arrayBuffer());
  }
}

const flushFrames = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("useAudioStream lifecycle", () => {
  const OriginalAudioContext = window.AudioContext;

  beforeEach(() => {
    FakeAudioContext.instances = [];
    FakeAudioContext.failCreateGain = false;
    window.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
  });

  afterEach(() => {
    window.AudioContext = OriginalAudioContext;
    vi.restoreAllMocks();
  });

  it("owns listeners, context resume, reconnect reset, disable, and unmount cleanup", async () => {
    vi.spyOn(performance, "now").mockReturnValue(1_000);
    const socket = new FakeSocket();
    const typedSocket = socket as unknown as Socket;
    const { result, rerender, unmount } = renderHook<UseAudioStreamReturn, { enabled: boolean }>(
      ({ enabled }) => useAudioStream({ socket: typedSocket, enabled }),
      { initialProps: { enabled: false } },
    );
    expect(socket.listenerCount("audio_frame")).toBe(0);

    await act(async () => { await result.current.activate(); });
    const context = FakeAudioContext.instances[0]!;
    expect(context.resumeCount).toBe(1);

    rerender({ enabled: true });
    expect(socket.listenerCount("audio_frame")).toBe(1);
    expect(socket.listenerCount("disconnect")).toBe(1);

    await act(async () => {
      socket.dispatch("audio_frame", audioFrame(0));
      await flushFrames();
    });
    expect(context.sources[0]?.starts).toEqual([10.05]);
    expect(result.current.metrics.queueDurationMs).toBeGreaterThan(0);

    act(() => context.suspendFromBrowser());
    expect(context.sources[0]?.stopCount).toBe(1);
    expect(result.current.metrics.queueDurationMs).toBe(0);
    await act(async () => { await result.current.activate(); });
    expect(context.resumeCount).toBe(2);

    await act(async () => {
      socket.dispatch("audio_frame", audioFrame(1));
      await flushFrames();
      socket.dispatch("disconnect");
    });
    expect(context.sources[1]?.stopCount).toBe(1);

    await act(async () => {
      socket.dispatch("audio_frame", audioFrame(2));
      await flushFrames();
    });
    expect(context.sources[2]?.starts).toEqual([10.05]);

    rerender({ enabled: false });
    expect(socket.listenerCount("audio_frame")).toBe(0);
    expect(socket.listenerCount("disconnect")).toBe(0);
    expect(context.sources[2]?.stopCount).toBe(1);

    rerender({ enabled: true });
    await act(async () => {
      socket.dispatch("audio_frame", audioFrame(3));
      await flushFrames();
    });
    expect(context.sources[3]?.starts).toEqual([10.05]);

    unmount();
    expect(context.sources[3]?.stopCount).toBe(1);
    expect(context.closeCount).toBe(1);
  });

  it("closes a partially initialized AudioContext", async () => {
    FakeAudioContext.failCreateGain = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const socket = new FakeSocket() as unknown as Socket;
    const { result, unmount } = renderHook(() => useAudioStream({ socket, enabled: false }));

    await act(async () => { await result.current.activate(); });
    expect(FakeAudioContext.instances[0]?.closeCount).toBe(1);
    expect(result.current.contextState).toBe("uninitialized");
    unmount();
    expect(FakeAudioContext.instances[0]?.closeCount).toBe(1);
  });

  it("preserves delayed Blob ordering and records pending-decode overflow", async () => {
    vi.spyOn(performance, "now").mockReturnValue(1_000);
    const socket = new FakeSocket();
    const typedSocket = socket as unknown as Socket;
    const { result, rerender, unmount } = renderHook<UseAudioStreamReturn, { enabled: boolean }>(
      ({ enabled }) => useAudioStream({ socket: typedSocket, enabled }),
      { initialProps: { enabled: false } },
    );
    await act(async () => { await result.current.activate(); });
    rerender({ enabled: true });

    const delayed = new DeferredBlob();
    await act(async () => {
      socket.dispatch("audio_frame", binaryMetadata(0), delayed);
      for (let frameId = 1; frameId < 5; frameId++) {
        socket.dispatch(
          "audio_frame",
          binaryMetadata(frameId),
          new Blob([new Uint8Array(1_600)]),
        );
      }
      await flushFrames();
    });
    expect(FakeAudioContext.instances[0]?.sources).toHaveLength(0);
    expect(result.current.metrics.decoderDrops).toBe(1);

    await act(async () => {
      await delayed.release();
    });
    // Frames 0-3 all process after the delayed Blob resolves. With the
    // horizon-overflow reset fix, frames 2-3 are scheduled (with timeline
    // resets) instead of dropped, so all 4 create sources.
    await waitFor(() => {
      expect(FakeAudioContext.instances[0]?.sources).toHaveLength(4);
    });
    // Delayed frame 0 schedules first at target lead, frame 1 follows.
    const starts = FakeAudioContext.instances[0]?.sources.map((source) => source.starts[0]);
    expect(starts?.[0]).toBeCloseTo(10.05);
    expect(starts?.[1]).toBeCloseTo(10.1);
    unmount();
  });

  it("publishes metrics no more than once per second", async () => {
    let monotonicNow = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => monotonicNow);
    const socket = new FakeSocket();
    const typedSocket = socket as unknown as Socket;
    const { result, rerender, unmount } = renderHook<UseAudioStreamReturn, { enabled: boolean }>(
      ({ enabled }) => useAudioStream({ socket: typedSocket, enabled }),
      { initialProps: { enabled: false } },
    );
    await act(async () => { await result.current.activate(); });
    rerender({ enabled: true });

    await act(async () => {
      socket.dispatch("audio_frame", audioFrame(0));
      await flushFrames();
    });
    expect(result.current.metrics.framesReceived).toBe(1);

    monotonicNow = 1_500;
    await act(async () => {
      socket.dispatch("audio_frame", audioFrame(1));
      await flushFrames();
    });
    expect(result.current.metrics.framesReceived).toBe(1);

    monotonicNow = 2_001;
    await act(async () => {
      socket.dispatch("audio_frame", audioFrame(2));
      await flushFrames();
    });
    expect(result.current.metrics.framesReceived).toBe(3);
    unmount();
  });

  it("self-heals a suspended AudioContext on frame arrival", async () => {
    vi.spyOn(performance, "now").mockReturnValue(1_000);
    const socket = new FakeSocket();
    const typedSocket = socket as unknown as Socket;
    const { result, rerender, unmount } = renderHook<UseAudioStreamReturn, { enabled: boolean }>(
      ({ enabled }) => useAudioStream({ socket: typedSocket, enabled }),
      { initialProps: { enabled: false } },
    );

    await act(async () => { await result.current.activate(); });
    const context = FakeAudioContext.instances[0]!;
    expect(context.resumeCount).toBe(1);

    rerender({ enabled: true });

    // Simulate the browser suspending the AudioContext (e.g. system audio
    // policy change) WITHOUT the user re-clicking activate.
    act(() => context.suspendFromBrowser());
    expect(context.state).toBe("suspended");

    // A frame arrives while suspended — self-healing resume() should
    // recover the context and schedule the frame instead of dropping it.
    await act(async () => {
      socket.dispatch("audio_frame", audioFrame(0));
      await flushFrames();
    });

    expect(context.resumeCount).toBeGreaterThanOrEqual(2);
    expect(result.current.metrics.suspendedDrops).toBe(0);
    expect(context.sources[0]?.starts).toEqual([10.05]);

    unmount();
  });

  it("is immune to clock skew between rover and browser", async () => {
    vi.spyOn(performance, "now").mockReturnValue(1_000);
    // Simulate the rover clock being 30 seconds behind the browser.
    // Without clock-offset correction, ageMs = 30000 > 1000 → "too-old" drop.
    const browserNow = Date.now();
    const roverNow = browserNow - 30_000;
    vi.spyOn(Date, "now").mockReturnValue(browserNow);

    const socket = new FakeSocket();
    const typedSocket = socket as unknown as Socket;
    const { result, rerender, unmount } = renderHook<UseAudioStreamReturn, { enabled: boolean }>(
      ({ enabled }) => useAudioStream({ socket: typedSocket, enabled }),
      { initialProps: { enabled: false } },
    );

    await act(async () => { await result.current.activate(); });
    rerender({ enabled: true });

    // Use a metadata object with the ROVER's timestamp (30s behind browser).
    const skewedMetadata = {
      protocol_version: 1 as const,
      timestamp: roverNow,
      capture_timestamp_ms: roverNow,
      stream_id: "550e8400-e29b-41d4-a716-446655440000",
      frame_id: 0,
      sample_rate: 16_000,
      channels: 1,
      sample_count: 800,
      duration_ms: 50,
      format: "s16le" as const,
    };

    await act(async () => {
      socket.dispatch("audio_frame", skewedMetadata, new Blob([new Uint8Array(1_600)]));
      await flushFrames();
    });

    // Frame should be scheduled despite 30s clock skew.
    expect(result.current.metrics.scheduledFrames).toBe(1);
    expect(result.current.metrics.tooOldDrops).toBe(0);
    expect(result.current.metrics.suspendedDrops).toBe(0);
    expect(FakeAudioContext.instances[0]?.sources[0]?.starts).toEqual([10.05]);

    unmount();
  });
});
