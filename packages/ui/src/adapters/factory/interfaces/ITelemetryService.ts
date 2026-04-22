/**
 * ITelemetryService - Receiving telemetry data from the rover
 */

import type {
  RoverTelemetry,
  ArmTelemetry,
  TrackingTelemetry,
  SystemMetrics,
  SpeechTranscription,
} from "@robo-fleet/shared/types";

export interface ITelemetryService {
  /**
   * Subscribe to rover position/velocity telemetry
   * @returns Unsubscribe function
   */
  onRoverTelemetry(callback: (data: RoverTelemetry) => void): () => void;

  /**
   * Subscribe to arm joint telemetry
   * @returns Unsubscribe function
   */
  onArmTelemetry(callback: (data: ArmTelemetry) => void): () => void;

  /**
   * Subscribe to visual servo/tracking telemetry
   * @returns Unsubscribe function
   */
  onServoTelemetry(callback: (data: TrackingTelemetry) => void): () => void;

  /**
   * Subscribe to system performance metrics
   * @returns Unsubscribe function
   */
  onPerformanceMetrics(callback: (data: SystemMetrics) => void): () => void;

  /**
   * Subscribe to speech transcription results
   * @returns Unsubscribe function
   */
  onTranscription(callback: (data: SpeechTranscription) => void): () => void;
}
