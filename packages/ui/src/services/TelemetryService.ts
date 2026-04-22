/**
 * Telemetry Service Facade
 * Static class wrapping the telemetry service factory getter
 */

import { getTelemetryService } from "../adapters/factory";
import type {
  RoverTelemetry,
  ArmTelemetry,
  TrackingTelemetry,
  SystemMetrics,
  SpeechTranscription,
} from "@robo-fleet/shared/types";

export class TelemetryService {
  static onRoverTelemetry(callback: (data: RoverTelemetry) => void): () => void {
    return getTelemetryService().onRoverTelemetry(callback);
  }

  static onArmTelemetry(callback: (data: ArmTelemetry) => void): () => void {
    return getTelemetryService().onArmTelemetry(callback);
  }

  static onServoTelemetry(callback: (data: TrackingTelemetry) => void): () => void {
    return getTelemetryService().onServoTelemetry(callback);
  }

  static onPerformanceMetrics(callback: (data: SystemMetrics) => void): () => void {
    return getTelemetryService().onPerformanceMetrics(callback);
  }

  static onTranscription(callback: (data: SpeechTranscription) => void): () => void {
    return getTelemetryService().onTranscription(callback);
  }
}
