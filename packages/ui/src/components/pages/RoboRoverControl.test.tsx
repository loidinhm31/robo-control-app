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
  SpeechTranscription,
  SttStatus,
  TtsConfigState,
  VoiceStatus,
} from "@robo-fleet/shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SocketHandler = (...args: never[]) => void;

class FakeSocket {
  id = "socket-test";
  connected = true;
  private readonly handlers = new Map<string, Set<SocketHandler>>();

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

  emit(): this { return this; }

  disconnect(): this {
    if (this.connected) {
      this.connected = false;
      this.dispatch("disconnect", "io client disconnect");
    }
    return this;
  }

  dispatch(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args as never[]);
    }
  }
}

const socketMock = vi.hoisted(() => ({
  current: null as FakeSocket | null,
  io: vi.fn(),
}));

vi.mock("socket.io-client", () => ({
  io: socketMock.io,
}));

import { RoboRoverControl } from "./RoboRoverControl";

const readyStatus: SttStatus = {
  state: "ready",
  profile: "en-vad-offline",
  language: "en",
  timestamp: 1_720_000_000_000,
  error: null,
};

function privateTranscription(text: string, utteranceId: string): SpeechTranscription {
  return {
    text,
    confidence: null,
    language: "en",
    duration_ms: 500,
    timestamp: 1_720_000_000_000,
    utterance_id: utteranceId,
    stream_id: "550e8400-e29b-41d4-a716-446655440000",
    source_kind: "browser",
    entity_id: null,
    target_entity_id: "rover-a",
    profile: "en-vad-offline",
  };
}

function voiceStatus(
  entityId: string,
  revision: number,
  state: VoiceStatus["state"] = "ready",
): VoiceStatus {
  return {
    entity_id: entityId,
    state,
    applied_revision: revision,
    applied_config: {
      language: "en",
      speaker_id: 5,
      speed: 1.0,
      num_steps: 8,
      volume: 0.8,
    },
    timestamp: 1_720_000_000_000 + revision,
  };
}

function configState(
  revision: number,
  statuses: VoiceStatus[],
): TtsConfigState {
  return {
    desired_revision: revision,
    desired_config: {
      language: "en",
      speaker_id: 5,
      speed: 1.0,
      num_steps: 8,
      volume: 0.8,
    },
    applied_rovers: statuses.filter((status) => status.applied_revision === revision).length,
    active_rovers: statuses.length,
    rovers: statuses,
    timestamp: 1_720_000_000_100 + revision,
  };
}

describe("RoboRoverControl STT session boundaries", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    socketMock.current = new FakeSocket();
    socketMock.io.mockReset();
    socketMock.io.mockImplementation(() => socketMock.current);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("clears private history on session loss and restores authoritative status events", async () => {
    render(<RoboRoverControl />);
    await waitFor(() => expect(socketMock.io).toHaveBeenCalledTimes(1));
    const socket = socketMock.current!;

    act(() => {
      socket.dispatch("connect");
      socket.dispatch("fleet_status", {
        selected_entity: "rover-a",
        fleet_roster: ["rover-a"],
        timestamp: Date.now(),
      });
      socket.dispatch("stt_status", readyStatus);
      socket.dispatch(
        "voice_command_transcription",
        privateTranscription("private command one", "utterance-one"),
      );
    });
    fireEvent.click(screen.getByText("Voice"));
    expect(await screen.findByText("private command one")).toBeTruthy();
    expect(screen.getByTestId("stt-profile").textContent).toBe("en-vad-offline");

    act(() => socket.dispatch("disconnect", "transport close"));
    await waitFor(() => expect(screen.queryByText("private command one")).toBeNull());
    expect(screen.getByTestId("stt-profile").textContent).toBe("unavailable");

    act(() => {
      socket.connected = true;
      socket.dispatch("connect");
      socket.dispatch("stt_status", {
        ...readyStatus,
        profile: "vi-vad-offline",
        language: "vi",
      });
    });
    await waitFor(() => expect(screen.getByTestId("stt-profile").textContent)
      .toBe("vi-vad-offline"));

    act(() => {
      socket.dispatch(
        "voice_command_transcription",
        privateTranscription("private command two", "utterance-two"),
      );
    });
    expect(await screen.findByText("private command two")).toBeTruthy();
    act(() => socket.dispatch("auth_error", { reason: "token_expired" }));
    await waitFor(() => expect(screen.queryByText("private command two")).toBeNull());
  });

  it("hydrates authoritative TTS state on reconnect and clears stale voice UI on disconnect", async () => {
    render(<RoboRoverControl />);
    await waitFor(() => expect(socketMock.io).toHaveBeenCalledTimes(1));
    const socket = socketMock.current!;

    act(() => {
      socket.dispatch("connect");
      socket.dispatch("auth_token", "header.payload.signature");
      socket.dispatch("fleet_status", {
        selected_entity: "rover-a",
        fleet_roster: ["rover-a"],
        timestamp: Date.now(),
      });
      socket.dispatch("tts_config_state", configState(4, [voiceStatus("rover-a", 4)]));
      socket.dispatch("voice_status", voiceStatus("rover-a", 4));
    });

    fireEvent.click(screen.getByText("Voice"));
    expect(await screen.findByText("Desired R4")).toBeTruthy();
    expect(screen.getByText("Applied 1/1")).toBeTruthy();

    act(() => {
      socket.dispatch("tts_command_result", {
        command_id: "cmd-1",
        entity_id: "rover-a",
        state: "interrupted",
        timestamp: Date.now(),
        reason_code: "interrupted_by_walkie",
        detail: "live walkie started",
      });
    });
    expect(await screen.findByText("Walkie-talkie took priority")).toBeTruthy();

    act(() => socket.dispatch("disconnect", "transport close"));
    await waitFor(() =>
      expect(
        screen.getByText("Waiting for the server to publish the authoritative TTS configuration."),
      ).toBeTruthy()
    );
    expect(screen.queryByText("Walkie-talkie took priority")).toBeNull();

    act(() => {
      socket.connected = true;
      socket.dispatch("connect");
      socket.dispatch("auth_token", "header.payload.signature");
      socket.dispatch("tts_config_state", configState(5, [voiceStatus("rover-a", 5)]));
      socket.dispatch("voice_status", voiceStatus("rover-a", 5, "speaking"));
    });
    expect(await screen.findByText("Desired R5")).toBeTruthy();
  });
});
