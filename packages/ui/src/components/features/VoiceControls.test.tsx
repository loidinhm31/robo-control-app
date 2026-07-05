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
import type {
  SttStatus,
  TtsCommandResult,
  TtsConfigState,
  TtsRuntimeConfig,
  VoiceStatus,
} from "@robo-fleet/shared/types";
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

const defaultConfig: TtsRuntimeConfig = {
  language: "en",
  speaker_id: 5,
  speed: 1.0,
  num_steps: 8,
  volume: 0.8,
};

const selectedVoiceStatus: VoiceStatus = {
  entity_id: "rover-a",
  state: "ready",
  applied_revision: 4,
  applied_config: defaultConfig,
  timestamp: 1_720_000_000_000,
};

const configState: TtsConfigState = {
  desired_revision: 4,
  desired_config: defaultConfig,
  applied_rovers: 1,
  active_rovers: 2,
  rovers: [
    selectedVoiceStatus,
    {
      entity_id: "rover-b",
      state: "loading",
      applied_revision: 3,
      applied_config: defaultConfig,
      timestamp: 1_720_000_000_100,
    },
  ],
  timestamp: 1_720_000_000_000,
};

interface RenderVoiceControlsOptions {
  isAuthenticated?: boolean;
  isConnected?: boolean;
  lastTtsResult?: TtsCommandResult | null;
  ttsConfigState?: TtsConfigState | null;
  voiceStatuses?: readonly VoiceStatus[];
  onSendTts?: ReturnType<typeof vi.fn>;
  onUpdateTtsConfig?: ReturnType<typeof vi.fn>;
}

function renderControls(
  socket: FakeSocket,
  options: RenderVoiceControlsOptions = {},
): {
  onSendTts: ReturnType<typeof vi.fn>;
  onUpdateTtsConfig: ReturnType<typeof vi.fn>;
  rerenderControls: (nextOptions?: RenderVoiceControlsOptions) => void;
} {
  const onSendTts = options.onSendTts ?? vi.fn();
  const onUpdateTtsConfig = options.onUpdateTtsConfig ?? vi.fn();
  const renderView = (viewOptions: RenderVoiceControlsOptions): React.ReactElement => (
    <VoiceControls
      socket={socket as unknown as BrowserVoiceSocket}
      isConnected={viewOptions.isConnected ?? true}
      isAuthenticated={viewOptions.isAuthenticated ?? true}
      sttStatus={readyStatus}
      selectedEntityId="rover-a"
      browserTranscriptions={[]}
      ttsConfigState={viewOptions.ttsConfigState ?? configState}
      voiceStatuses={viewOptions.voiceStatuses ?? viewOptions.ttsConfigState?.rovers ?? configState.rovers}
      lastTtsAck={null}
      lastTtsResult={viewOptions.lastTtsResult ?? null}
      onSendTts={onSendTts}
      onUpdateTtsConfig={onUpdateTtsConfig}
    />
  );
  const rendered = render(renderView(options));
  fireEvent.click(screen.getByText("Voice"));
  return {
    onSendTts,
    onUpdateTtsConfig,
    rerenderControls: (nextOptions: RenderVoiceControlsOptions = {}) => {
      rendered.rerender(renderView({
        ...options,
        onSendTts,
        onUpdateTtsConfig,
        ...nextOptions,
      }));
    },
  };
}

describe("VoiceControls regressions", () => {
  beforeEach(() => {
    captureMocks.start.mockClear();
    captureMocks.stop.mockClear();
    FakeWalkieAudioContext.instances = [];
    FakeWalkieAudioContext.resumeGate = null;
    vi.useRealTimers();
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

  it("preserves explicit manual TTS emission through the page callback", () => {
    const socket = new FakeSocket();
    const { onSendTts } = renderControls(socket);

    const input = screen.getByPlaceholderText("Type message for rover speech output");
    fireEvent.change(input, { target: { value: "  status report  " } });
    fireEvent.click(screen.getByText("Speak Now"));

    expect(onSendTts).toHaveBeenCalledWith("status report");
  });

  it("debounces speed changes and sends full config updates with the current base revision", () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const { onUpdateTtsConfig } = renderControls(socket);

    fireEvent.change(screen.getByTestId("tts-speed-slider"), {
      target: { value: "1.25" },
    });

    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(onUpdateTtsConfig).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onUpdateTtsConfig).toHaveBeenCalledWith({
      base_revision: 4,
      config: {
        ...defaultConfig,
        speed: 1.25,
      },
    });
  });

  it("uses the latest authoritative revision when a debounced config update races with incoming state", () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const { onUpdateTtsConfig, rerenderControls } = renderControls(socket);

    fireEvent.change(screen.getByTestId("tts-speed-slider"), {
      target: { value: "1.25" },
    });

    rerenderControls({
      ttsConfigState: {
        ...configState,
        desired_revision: 5,
        desired_config: {
          ...defaultConfig,
          num_steps: 12,
        },
        rovers: [
          {
            ...selectedVoiceStatus,
            applied_revision: 5,
            applied_config: {
              ...defaultConfig,
              num_steps: 12,
            },
          },
        ],
        active_rovers: 1,
        applied_rovers: 1,
      },
      voiceStatuses: [
        {
          ...selectedVoiceStatus,
          applied_revision: 5,
          applied_config: {
            ...defaultConfig,
            num_steps: 12,
          },
        },
      ],
    });

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onUpdateTtsConfig).toHaveBeenCalledWith({
      base_revision: 5,
      config: {
        ...defaultConfig,
        speed: 1.25,
      },
    });
  });

  it("renders authoritative interruption alerts from rover results", async () => {
    const socket = new FakeSocket();
    renderControls(socket, {
      lastTtsResult: {
        command_id: "cmd-1",
        entity_id: "rover-a",
        state: "interrupted",
        timestamp: 1_720_000_000_200,
        reason_code: "interrupted_by_walkie",
        detail: "live walkie started",
      },
    });

    expect((await screen.findByRole("alert")).textContent).toContain("Walkie-talkie took priority");
    expect(
      screen.getByText(/Rover speech stopped because live walkie-talkie started\./),
    ).toBeTruthy();
  });

  it("clears stale alerts when authoritative voice state is dropped on disconnect", async () => {
    const socket = new FakeSocket();
    const { rerenderControls } = renderControls(socket, {
      lastTtsResult: {
        command_id: "cmd-1",
        entity_id: "rover-a",
        state: "interrupted",
        timestamp: 1_720_000_000_200,
        reason_code: "interrupted_by_walkie",
        detail: "live walkie started",
      },
    });

    expect(await screen.findByText("Walkie-talkie took priority")).toBeTruthy();

    rerenderControls({
      isConnected: false,
      isAuthenticated: false,
      ttsConfigState: null,
      voiceStatuses: [],
      lastTtsResult: null,
    });

    await waitFor(() =>
      expect(screen.queryByText("Walkie-talkie took priority")).toBeNull()
    );
  });

  it("disables TTS submission while local walkie is active and explains why", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: vi.fn() } as unknown as MediaStreamTrack],
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
    await waitFor(() => expect(screen.getByText("Walkie live")).toBeTruthy());

    const speakButton = screen.getByText("Speak Now").closest("button");
    expect(speakButton).not.toBeNull();
    expect((speakButton as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText("Live walkie-talkie has priority over local TTS."),
    ).toBeTruthy();
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
