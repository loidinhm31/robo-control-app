// @vitest-environment happy-dom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SpeechTranscription, SttStatus } from "@robo-fleet/shared/types";
import { afterEach, describe, expect, it } from "vitest";
import { TranscriptionDisplay } from "./TranscriptionDisplay";

const status: SttStatus = {
  state: "ready",
  profile: "vi-vad-offline",
  language: "vi",
  timestamp: 1_720_000_000_000,
  error: null,
};

function transcription(sourceKind: "browser" | "rover", index: number): SpeechTranscription {
  const entityId = sourceKind === "rover" ? `rover-${index}` : null;
  return {
    text: `${sourceKind} transcript ${index}`,
    confidence: null,
    language: "vi",
    duration_ms: 800,
    timestamp: 1_720_000_000_000 + index,
    utterance_id: `${sourceKind}-utterance-${index}`,
    stream_id: "550e8400-e29b-41d4-a716-446655440000",
    source_kind: sourceKind,
    entity_id: entityId,
    target_entity_id: entityId ?? "rover-browser-target",
    profile: "vi-vad-offline",
  };
}

describe("TranscriptionDisplay", () => {
  afterEach(cleanup);

  it("shows only rover-origin history with entity labels and nullable confidence", () => {
    render(
      <TranscriptionDisplay
        transcriptions={[
          transcription("rover", 1),
          transcription("browser", 2),
          transcription("rover", 3),
        ]}
        sttStatus={status}
        isAudioActive={false}
        maxHistory={2}
      />,
    );

    fireEvent.click(screen.getByText("STT ready"));
    expect(screen.getByText("rover transcript 1")).toBeTruthy();
    expect(screen.getByText("rover transcript 3")).toBeTruthy();
    expect(screen.queryByText("browser transcript 2")).toBeNull();
    expect(screen.getByTestId("rover-entity-badge").textContent).toBe("rover-1");
    expect(document.body.textContent).not.toContain("NaN%");
    expect(document.body.textContent).toContain("vi-vad-offline");
  });
});
