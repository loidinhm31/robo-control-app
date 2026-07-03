// @vitest-environment happy-dom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import type { SpeechTranscription, SttStatus } from "@robo-fleet/shared/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sanitizeStatusError, VoiceCommandPanel } from "./voice-command-panel";

const status: SttStatus = {
  state: "ready",
  profile: "en-vad-offline",
  language: "en",
  timestamp: 1_720_000_000_000,
  error: null,
};

function transcription(
  index: number,
  sourceKind: "browser" | "rover" = "browser",
): SpeechTranscription {
  const entityId = sourceKind === "rover" ? "rover-a" : null;
  return {
    text: `${sourceKind} text ${index}`,
    confidence: null,
    language: "en",
    duration_ms: 500,
    timestamp: 1_720_000_000_000 + index,
    utterance_id: `${sourceKind}-utterance-${index}`,
    stream_id: "550e8400-e29b-41d4-a716-446655440000",
    source_kind: sourceKind,
    entity_id: entityId,
    target_entity_id: entityId ?? "rover-b",
    profile: "en-vad-offline",
  };
}

describe("VoiceCommandPanel", () => {
  afterEach(cleanup);

  it("renders authoritative status, captured target, and bounded private history", () => {
    const transcriptions = [
      ...Array.from({ length: 7 }, (_, index) => transcription(index)),
      transcription(99, "rover"),
    ];
    render(
      <VoiceCommandPanel
        captureState="capturing"
        audioLevel={0.42}
        captureError={null}
        sttStatus={status}
        selectedTargetEntityId="rover-b"
        capturedTargetEntityId="rover-a"
        transcriptions={transcriptions}
        canStart={true}
        disabledReason={null}
        onToggleCapture={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByTestId("stt-profile").textContent).toBe("en-vad-offline");
    expect(screen.getByTestId("voice-command-target").textContent).toBe("rover-a");
    expect(screen.getByText("browser text 0")).toBeTruthy();
    expect(screen.getByText("browser text 4")).toBeTruthy();
    expect(screen.queryByText("browser text 5")).toBeNull();
    expect(screen.queryByText("rover text 99")).toBeNull();
  });

  it("disables start with a concrete readiness reason", () => {
    render(
      <VoiceCommandPanel
        captureState="idle"
        audioLevel={0}
        captureError={null}
        sttStatus={null}
        selectedTargetEntityId={null}
        capturedTargetEntityId={null}
        transcriptions={[]}
        canStart={false}
        disabledReason="Waiting for authoritative STT status."
        onToggleCapture={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByTestId("voice-command-toggle")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("voice-command-disabled-reason").textContent)
      .toContain("authoritative STT status");
  });

  it("sanitizes and bounds backend status errors", () => {
    expect(sanitizeStatusError(`bad\u0000status ${"x".repeat(200)}`))
      .toHaveLength(160);
    expect(sanitizeStatusError("bad\u0000status")).toBe("bad status");
  });
});
