// @vitest-environment happy-dom

import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { SttStatus } from "@robo-fleet/shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserVoiceSocket } from "../../hooks/use-browser-voice-capture";

const captureMocks = vi.hoisted(() => ({
  start: vi.fn(async () => true),
  stop: vi.fn(async () => undefined),
}));

vi.mock("../../hooks/use-browser-voice-capture", () => ({
  useBrowserVoiceCapture: () => ({
    state: "idle",
    isCapturing: false,
    audioLevel: 0,
    error: null,
    capturedTargetEntityId: null,
    start: captureMocks.start,
    stop: captureMocks.stop,
  }),
}));

import { VoiceControls } from "./VoiceControls";

class FakeSocket {
  connected = true;
  readonly emitted: Array<{ event: string; payload: unknown }> = [];
  emit(event: string, payload: unknown): this {
    this.emitted.push({ event, payload });
    return this;
  }
}

class FakeAudioNode {
  disconnectCount = 0;
  connect(): void {}
  disconnect(): void { this.disconnectCount += 1; }
}

class FakeWalkieWorkletNode extends FakeAudioNode {
  readonly port = {
    onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
  };
}

class FakeWalkieAudioContext {
  static instances: FakeWalkieAudioContext[] = [];
  static resumeGate: Promise<void> | null = null;
  readonly sampleRate = 16_000;
  readonly source = new FakeAudioNode();
  readonly analyser = Object.assign(new FakeAudioNode(), {
    fftSize: 0,
    frequencyBinCount: 128,
    getByteFrequencyData: (data: Uint8Array): void => data.fill(0),
  });
  readonly audioWorklet = { addModule: vi.fn(async () => undefined) };
  state: AudioContextState = "suspended";
  resumeCount = 0;
  closeCount = 0;

  constructor() { FakeWalkieAudioContext.instances.push(this); }
  createMediaStreamSource(): MediaStreamAudioSourceNode {
    return this.source as unknown as MediaStreamAudioSourceNode;
  }
  createAnalyser(): AnalyserNode {
    return this.analyser as unknown as AnalyserNode;
  }
  async resume(): Promise<void> {
    this.resumeCount += 1;
    if (FakeWalkieAudioContext.resumeGate) {
      await FakeWalkieAudioContext.resumeGate;
    }
    if (this.state !== "closed") this.state = "running";
  }
  async close(): Promise<void> {
    this.closeCount += 1;
    this.state = "closed";
  }
}

const readyStatus: SttStatus = {
  state: "ready",
  profile: "en-vad-offline",
  language: "en",
  timestamp: 1_720_000_000_000,
  error: null,
};

function renderControls(socket: FakeSocket): void {
  render(
    <VoiceControls
      socket={socket as unknown as BrowserVoiceSocket}
      isConnected={true}
      isAuthenticated={true}
      sttStatus={readyStatus}
      selectedEntityId="rover-a"
      browserTranscriptions={[]}
    />,
  );
  fireEvent.click(screen.getByText("Voice"));
}

describe("VoiceControls regressions", () => {
  beforeEach(() => {
    captureMocks.start.mockClear();
    captureMocks.stop.mockClear();
    FakeWalkieAudioContext.instances = [];
    FakeWalkieAudioContext.resumeGate = null;
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("preserves explicit manual TTS emission", () => {
    const socket = new FakeSocket();
    renderControls(socket);

    const input = screen.getByPlaceholderText("Type message to speak...");
    fireEvent.change(input, { target: { value: "  status report  " } });
    const submit = input.parentElement?.querySelector("button");
    expect(submit).not.toBeNull();
    fireEvent.click(submit!);

    expect(socket.emitted).toContainEqual({
      event: "tts_command",
      payload: { text: "status report" },
    });
  });

  it("cancels pending walkie startup before starting browser capture", async () => {
    const socket = new FakeSocket();
    let resolveStream!: (stream: MediaStream) => void;
    const pendingStream = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn(() => pendingStream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    renderControls(socket);

    fireEvent.click(screen.getByTestId("walkie-toggle"));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("walkie-toggle").textContent)
      .toContain("Starting"));

    fireEvent.click(screen.getByTestId("voice-command-toggle"));
    await waitFor(() => expect(captureMocks.start).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveStream({
        getTracks: () => [{ stop: stopTrack } as unknown as MediaStreamTrack],
      } as MediaStream);
      await pendingStream;
    });
    await waitFor(() => expect(stopTrack).toHaveBeenCalledTimes(1));
    expect(socket.emitted.some((entry) => entry.event === "audio_stream"))
      .toBe(false);
  });

  it("does not reactivate walkie-talkie when switched during AudioContext resume", async () => {
    let resolveResume!: () => void;
    FakeWalkieAudioContext.resumeGate = new Promise<void>((resolve) => {
      resolveResume = resolve;
    });
    const stopTrack = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: stopTrack } as unknown as MediaStreamTrack],
        } as MediaStream)),
      },
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:walkie-worklet"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal("AudioContext", FakeWalkieAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeWalkieWorkletNode);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 9));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const socket = new FakeSocket();
    renderControls(socket);

    fireEvent.click(screen.getByTestId("walkie-toggle"));
    await waitFor(() => expect(FakeWalkieAudioContext.instances[0]?.resumeCount)
      .toBe(1));
    fireEvent.click(screen.getByTestId("voice-command-toggle"));
    await waitFor(() => expect(captureMocks.start).toHaveBeenCalledTimes(1));

    await act(async () => { resolveResume(); });
    await waitFor(() => expect(stopTrack).toHaveBeenCalledTimes(1));
    expect(FakeWalkieAudioContext.instances[0]?.closeCount).toBe(1);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(socket.emitted.some((entry) => entry.event === "audio_stream"))
      .toBe(false);
  });
});
