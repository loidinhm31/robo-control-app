// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useBrowserVoiceCapture,
  type BrowserVoiceSocket,
} from "./use-browser-voice-capture";

type SocketHandler = (...args: never[]) => void;

class FakeSocket {
  connected = true;
  readonly emitted: Array<{ event: string; payload: unknown }> = [];
  private readonly handlers = new Map<string, Set<SocketHandler>>();

  emit(event: string, payload: unknown): this {
    this.emitted.push({ event, payload });
    return this;
  }

  on(event: string, handler: SocketHandler): this {
    const listeners = this.handlers.get(event) ?? new Set<SocketHandler>();
    listeners.add(handler);
    this.handlers.set(event, listeners);
    return this;
  }

  off(event: string, handler: SocketHandler): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  disconnectFromServer(): void {
    this.connected = false;
    for (const handler of this.handlers.get("disconnect") ?? []) handler();
  }
}

class FakeTrack {
  stopCount = 0;
  stop(): void { this.stopCount += 1; }
}

class FakeMediaStream {
  readonly track = new FakeTrack();
  getTracks(): MediaStreamTrack[] {
    return [this.track as unknown as MediaStreamTrack];
  }
}

class FakeNode {
  disconnectCount = 0;
  connect(): void {}
  disconnect(): void { this.disconnectCount += 1; }
}

class FakeAnalyser extends FakeNode {
  fftSize = 0;
  frequencyBinCount = 128;
  getByteFrequencyData(data: Uint8Array): void { data.fill(32); }
}

class FakeMessagePort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  private pendingAudio: number[] | null = null;

  postMessage(message: unknown): void {
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "flush"
    ) {
      if (this.pendingAudio) {
        this.sendAudio(this.pendingAudio);
        this.pendingAudio = null;
      }
      this.onmessage?.({ data: { type: "flush-complete" } } as MessageEvent);
    }
  }

  sendAudio(samples: number[]): void {
    this.onmessage?.({
      data: { type: "audio-data", audioData: new Float32Array(samples) },
    } as MessageEvent);
  }

  queuePartialAudio(samples: number[]): void {
    this.pendingAudio = samples;
  }
}

class FakeWorkletNode extends FakeNode {
  static instances: FakeWorkletNode[] = [];
  readonly port = new FakeMessagePort();
  constructor() {
    super();
    FakeWorkletNode.instances.push(this);
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static resumeGate: Promise<void> | null = null;
  readonly sampleRate = 48_000;
  readonly audioWorklet = { addModule: vi.fn(async () => undefined) };
  readonly source = new FakeNode();
  readonly analyser = new FakeAnalyser();
  state: AudioContextState = "suspended";
  closeCount = 0;
  resumeCount = 0;

  constructor() { FakeAudioContext.instances.push(this); }
  createMediaStreamSource(): MediaStreamAudioSourceNode {
    return this.source as unknown as MediaStreamAudioSourceNode;
  }
  createAnalyser(): AnalyserNode {
    return this.analyser as unknown as AnalyserNode;
  }
  async resume(): Promise<void> {
    this.resumeCount += 1;
    if (FakeAudioContext.resumeGate) await FakeAudioContext.resumeGate;
    if (this.state !== "closed") this.state = "running";
  }
  async close(): Promise<void> {
    this.closeCount += 1;
    this.state = "closed";
  }
}

describe("useBrowserVoiceCapture", () => {
  let mediaStream: FakeMediaStream;

  beforeEach(() => {
    mediaStream = new FakeMediaStream();
    FakeAudioContext.instances = [];
    FakeAudioContext.resumeGate = null;
    FakeWorkletNode.instances = [];
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => mediaStream as unknown as MediaStream) },
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:voice-worklet"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 7));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "550e8400-e29b-41d4-a716-446655440000"),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("emits target-free start, ordered 50 ms frames, and exactly one stop", async () => {
    const fakeSocket = new FakeSocket();
    const socket = fakeSocket as unknown as BrowserVoiceSocket;
    const { result, rerender } = renderHook(
      ({ target }) => useBrowserVoiceCapture({
        socket,
        enabled: true,
        targetEntityId: target,
      }),
      { initialProps: { target: "rover-a" } },
    );

    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe("capturing");
    expect(result.current.capturedTargetEntityId).toBe("rover-a");
    const start = fakeSocket.emitted[0];
    expect(start).toEqual({
      event: "voice_command_control",
      payload: {
        command: "start",
        stream_id: "550e8400-e29b-41d4-a716-446655440000",
        sample_rate: 48_000,
        channels: 1,
      },
    });
    expect(start?.payload).not.toHaveProperty("target_entity_id");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:voice-worklet");

    rerender({ target: "rover-b" });
    expect(result.current.capturedTargetEntityId).toBe("rover-a");
    act(() => {
      FakeWorkletNode.instances[0]?.port.sendAudio(new Array(2_400).fill(0.25));
      FakeWorkletNode.instances[0]?.port.sendAudio(new Array(2_400).fill(-0.25));
    });
    const frames = fakeSocket.emitted.filter(
      (entry) => entry.event === "voice_command_audio",
    );
    expect(frames).toHaveLength(2);
    expect(frames.map((entry) => (entry.payload as { frame_id: number }).frame_id))
      .toEqual([0, 1]);
    expect(frames[0]?.payload).toMatchObject({
      sample_rate: 48_000,
      sample_count: 2_400,
      channels: 1,
    });
    expect(frames[0]?.payload).not.toHaveProperty("target_entity_id");

    FakeWorkletNode.instances[0]?.port.queuePartialAudio(new Array(1_200).fill(0.1));
    await act(async () => {
      await result.current.stop();
      await result.current.stop();
    });
    const flushedFrames = fakeSocket.emitted.filter(
      (entry) => entry.event === "voice_command_audio",
    );
    expect(flushedFrames).toHaveLength(3);
    expect(flushedFrames[2]?.payload).toMatchObject({
      frame_id: 2,
      sample_count: 1_200,
    });
    const stops = fakeSocket.emitted.filter(
      (entry) =>
        entry.event === "voice_command_control" &&
        (entry.payload as { command?: string }).command === "stop",
    );
    expect(stops).toHaveLength(1);
    expect(fakeSocket.emitted.indexOf(stops[0]!))
      .toBeGreaterThan(fakeSocket.emitted.indexOf(flushedFrames[2]!));
    expect(mediaStream.track.stopCount).toBe(1);
    expect(FakeAudioContext.instances[0]?.closeCount).toBe(1);
  });

  it("cleans up on disconnect without buffering a stale stop", async () => {
    const fakeSocket = new FakeSocket();
    const { result } = renderHook(() => useBrowserVoiceCapture({
      socket: fakeSocket as unknown as BrowserVoiceSocket,
      enabled: true,
      targetEntityId: "rover-a",
    }));
    await act(async () => { await result.current.start(); });

    act(() => fakeSocket.disconnectFromServer());
    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.error).toBe("Voice connection was lost");
    expect(mediaStream.track.stopCount).toBe(1);
    const stops = fakeSocket.emitted.filter(
      (entry) =>
        entry.event === "voice_command_control" &&
        (entry.payload as { command?: string }).command === "stop",
    );
    expect(stops).toHaveLength(0);
  });

  it("coalesces repeated start requests into one stream lifecycle", async () => {
    const fakeSocket = new FakeSocket();
    const { result } = renderHook(() => useBrowserVoiceCapture({
      socket: fakeSocket as unknown as BrowserVoiceSocket,
      enabled: true,
      targetEntityId: "rover-a",
    }));

    let secondStart = true;
    await act(async () => {
      const first = result.current.start();
      secondStart = await result.current.start();
      await first;
    });
    expect(secondStart).toBe(false);
    expect(fakeSocket.emitted.filter(
      (entry) =>
        entry.event === "voice_command_control" &&
        (entry.payload as { command?: string }).command === "start",
    )).toHaveLength(1);
  });

  it("does not reactivate capture when stopped during AudioContext resume", async () => {
    let resolveResume!: () => void;
    FakeAudioContext.resumeGate = new Promise<void>((resolve) => {
      resolveResume = resolve;
    });
    const fakeSocket = new FakeSocket();
    const { result } = renderHook(() => useBrowserVoiceCapture({
      socket: fakeSocket as unknown as BrowserVoiceSocket,
      enabled: true,
      targetEntityId: "rover-a",
    }));

    let startPromise!: Promise<boolean>;
    act(() => { startPromise = result.current.start(); });
    await waitFor(() => expect(fakeSocket.emitted.some(
      (entry) =>
        entry.event === "voice_command_control" &&
        (entry.payload as { command?: string }).command === "start",
    )).toBe(true));

    await act(async () => { await result.current.stop(); });
    expect(result.current.state).toBe("idle");
    await act(async () => {
      resolveResume();
      expect(await startPromise).toBe(false);
    });
    expect(result.current.state).toBe("idle");
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(FakeAudioContext.instances[0]?.closeCount).toBe(1);
  });

  it("refuses microphone access until status, auth, connection, and target enable capture", async () => {
    const fakeSocket = new FakeSocket();
    const getUserMedia = vi.mocked(navigator.mediaDevices.getUserMedia);
    const { result } = renderHook(() => useBrowserVoiceCapture({
      socket: fakeSocket as unknown as BrowserVoiceSocket,
      enabled: false,
      targetEntityId: null,
    }));

    await act(async () => {
      expect(await result.current.start()).toBe(false);
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(fakeSocket.emitted).toHaveLength(0);
  });

  it("emits one stop and releases resources on unmount", async () => {
    const fakeSocket = new FakeSocket();
    const { result, unmount } = renderHook(() => useBrowserVoiceCapture({
      socket: fakeSocket as unknown as BrowserVoiceSocket,
      enabled: true,
      targetEntityId: "rover-a",
    }));
    await act(async () => { await result.current.start(); });
    unmount();

    await waitFor(() => {
      const stops = fakeSocket.emitted.filter(
        (entry) =>
          entry.event === "voice_command_control" &&
          (entry.payload as { command?: string }).command === "stop",
      );
      expect(stops).toHaveLength(1);
    });
    expect(mediaStream.track.stopCount).toBe(1);
  });
});
