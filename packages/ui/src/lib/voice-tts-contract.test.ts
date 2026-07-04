import type {
  PlaybackState,
  TtsCommand,
  TtsCommandAck,
  TtsCommandResult,
  TtsConfigState,
  TtsConfigCommand,
  TtsConfigUpdate,
  TtsRuntimeConfig,
  VoiceStatus,
} from "@robo-fleet/shared/types";
import { describe, expect, it } from "vitest";

const timestamp = 1720000000000;
const commandId = "550e8400-e29b-41d4-a716-446655440000";
const defaultConfig = {
  language: "en",
  speaker_id: 5,
  speed: 1.0,
  num_steps: 8,
  volume: 0.8,
} satisfies TtsRuntimeConfig;

describe("edge voice Rust/TypeScript wire parity", () => {
  it("serializes command and config fixtures byte-for-byte", () => {
    const command = {
      command_id: commandId,
      text: "Hello rover",
      timestamp,
      priority: "normal",
    } satisfies TtsCommand;
    const configCommand = {
      revision: 0,
      config: defaultConfig,
    } satisfies TtsConfigCommand;
    const configUpdate = {
      base_revision: 0,
      config: defaultConfig,
    } satisfies TtsConfigUpdate;

    expect(JSON.stringify(command)).toBe(
      '{"command_id":"550e8400-e29b-41d4-a716-446655440000","text":"Hello rover","timestamp":1720000000000,"priority":"normal"}',
    );
    expect(JSON.stringify(defaultConfig)).toBe(
      '{"language":"en","speaker_id":5,"speed":1,"num_steps":8,"volume":0.8}',
    );
    expect(JSON.stringify(configCommand)).toBe(
      '{"revision":0,"config":{"language":"en","speaker_id":5,"speed":1,"num_steps":8,"volume":0.8}}',
    );
    expect(JSON.stringify(configUpdate)).toBe(
      '{"base_revision":0,"config":{"language":"en","speaker_id":5,"speed":1,"num_steps":8,"volume":0.8}}',
    );
  });

  it("omits and includes optional lifecycle fields exactly", () => {
    const accepted = {
      command_id: commandId,
      target_entity_id: "rover-kiwi",
      state: "accepted",
      timestamp,
    } satisfies TtsCommandAck;
    const rejected = {
      command_id: commandId,
      entity_id: "rover-kiwi",
      state: "rejected",
      timestamp,
      reason_code: "queue_full",
      detail: "voice queue saturated",
    } satisfies TtsCommandResult;
    const interrupted = {
      command_id: commandId,
      entity_id: "rover-kiwi",
      state: "interrupted",
      timestamp,
      reason_code: "interrupted_by_walkie",
      detail: "live walkie started",
    } satisfies TtsCommandResult;

    expect(JSON.stringify(accepted)).toBe(
      '{"command_id":"550e8400-e29b-41d4-a716-446655440000","target_entity_id":"rover-kiwi","state":"accepted","timestamp":1720000000000}',
    );
    expect(JSON.stringify(rejected)).toBe(
      '{"command_id":"550e8400-e29b-41d4-a716-446655440000","entity_id":"rover-kiwi","state":"rejected","timestamp":1720000000000,"reason_code":"queue_full","detail":"voice queue saturated"}',
    );
    expect(JSON.stringify(interrupted)).toBe(
      '{"command_id":"550e8400-e29b-41d4-a716-446655440000","entity_id":"rover-kiwi","state":"interrupted","timestamp":1720000000000,"reason_code":"interrupted_by_walkie","detail":"live walkie started"}',
    );
  });

  it("serializes status, config state, and playback fixtures byte-for-byte", () => {
    const ready = {
      entity_id: "rover-kiwi",
      state: "ready",
      applied_revision: 0,
      applied_config: defaultConfig,
      timestamp,
    } satisfies VoiceStatus;
    const configState = {
      desired_revision: 0,
      desired_config: defaultConfig,
      applied_rovers: 1,
      active_rovers: 1,
      rovers: [ready],
      timestamp,
    } satisfies TtsConfigState;
    const playback = {
      entity_id: "rover-kiwi",
      state: "active",
      source: "tts",
      command_id: commandId,
      timestamp,
    } satisfies PlaybackState;

    expect(JSON.stringify(ready)).toBe(
      '{"entity_id":"rover-kiwi","state":"ready","applied_revision":0,"applied_config":{"language":"en","speaker_id":5,"speed":1,"num_steps":8,"volume":0.8},"timestamp":1720000000000}',
    );
    expect(JSON.stringify(configState)).toBe(
      '{"desired_revision":0,"desired_config":{"language":"en","speaker_id":5,"speed":1,"num_steps":8,"volume":0.8},"applied_rovers":1,"active_rovers":1,"rovers":[{"entity_id":"rover-kiwi","state":"ready","applied_revision":0,"applied_config":{"language":"en","speaker_id":5,"speed":1,"num_steps":8,"volume":0.8},"timestamp":1720000000000}],"timestamp":1720000000000}',
    );
    expect(JSON.stringify(playback)).toBe(
      '{"entity_id":"rover-kiwi","state":"active","source":"tts","command_id":"550e8400-e29b-41d4-a716-446655440000","timestamp":1720000000000}',
    );
  });

  it("serializes speaking and walkie-preemption variants exactly", () => {
    const speaking = {
      entity_id: "rover-kiwi",
      state: "speaking",
      applied_revision: 0,
      applied_config: defaultConfig,
      active_command_id: commandId,
      timestamp,
    } satisfies VoiceStatus;
    const walkiePreemption = {
      entity_id: "rover-kiwi",
      state: "active",
      source: "walkie",
      command_id: commandId,
      timestamp,
      reason_code: "interrupted_by_walkie",
      detail: "live walkie started",
    } satisfies PlaybackState;

    expect(JSON.stringify(speaking)).toBe(
      '{"entity_id":"rover-kiwi","state":"speaking","applied_revision":0,"applied_config":{"language":"en","speaker_id":5,"speed":1,"num_steps":8,"volume":0.8},"active_command_id":"550e8400-e29b-41d4-a716-446655440000","timestamp":1720000000000}',
    );
    expect(JSON.stringify(walkiePreemption)).toBe(
      '{"entity_id":"rover-kiwi","state":"active","source":"walkie","command_id":"550e8400-e29b-41d4-a716-446655440000","timestamp":1720000000000,"reason_code":"interrupted_by_walkie","detail":"live walkie started"}',
    );
  });
});
