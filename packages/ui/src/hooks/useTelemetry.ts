/**
 * useTelemetry - Subscribe to all telemetry streams
 */

import { useState, useEffect } from "react";
import { TelemetryService } from "../services";
import type {
  RoverTelemetry,
  ArmTelemetry,
  TrackingTelemetry,
  SystemMetrics,
  SpeechTranscription,
} from "@robo-fleet/shared/types";

export interface UseTelemetryReturn {
  rover: RoverTelemetry | null;
  arm: ArmTelemetry | null;
  servo: TrackingTelemetry | null;
  performanceMetrics: Map<string, SystemMetrics>;
  transcription: SpeechTranscription | null;
}

export const useTelemetry = (): UseTelemetryReturn => {
  const [rover, setRover] = useState<RoverTelemetry | null>(null);
  const [arm, setArm] = useState<ArmTelemetry | null>(null);
  const [servo, setServo] = useState<TrackingTelemetry | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<Map<string, SystemMetrics>>(
    new Map()
  );
  const [transcription, setTranscription] = useState<SpeechTranscription | null>(null);

  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    try {
      unsubscribers.push(TelemetryService.onRoverTelemetry(setRover));
      unsubscribers.push(TelemetryService.onArmTelemetry(setArm));
      unsubscribers.push(TelemetryService.onServoTelemetry(setServo));
      unsubscribers.push(
        TelemetryService.onPerformanceMetrics((data) => {
          setPerformanceMetrics((prev) => {
            const next = new Map(prev);
            next.set(data.entity_id ?? "unknown", data);
            return next;
          });
        })
      );
      unsubscribers.push(TelemetryService.onTranscription(setTranscription));
    } catch {
      // Service not initialized yet
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, []);

  return {
    rover,
    arm,
    servo,
    performanceMetrics,
    transcription,
  };
};
