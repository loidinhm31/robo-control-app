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
import type { SpeechTranscription, SttStatus } from "@robo-fleet/shared/types";
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
});
