/**
 * IMediaService - Camera, video, and audio control + streaming
 */

import type { DetectionFrame, TrackingTelemetry } from "@robo-fleet/shared/types";

export interface JPEGVideoFrame {
  timestamp: number;
  frame_id: number;
  width: number;
  height: number;
  codec: "jpeg";
  data: number[]; // JPEG image as byte array
}

export interface AudioFrame {
  timestamp: number;
  frame_id: number;
  sample_rate: number;
  channels: number;
  format: string; // "s16le", "f32le", etc.
  data: number[]; // PCM audio data as byte array
}

export interface IMediaService {
  /**
   * Start the camera stream
   */
  startCamera(): void;

  /**
   * Stop the camera stream
   */
  stopCamera(): void;

  /**
   * Start audio capture (microphone on rover)
   */
  startAudioCapture(): void;

  /**
   * Stop audio capture
   */
  stopAudioCapture(): void;

  /**
   * Enable or disable performance metrics monitoring
   */
  enablePerformanceMonitoring(enabled: boolean): void;

  /**
   * Subscribe to video frames (JPEG encoded)
   * @returns Unsubscribe function
   */
  onVideoFrame(callback: (frame: JPEGVideoFrame) => void): () => void;

  /**
   * Subscribe to audio frames (PCM)
   * @returns Unsubscribe function
   */
  onAudioFrame(callback: (frame: AudioFrame) => void): () => void;

  /**
   * Subscribe to raw detections (before tracking)
   * @returns Unsubscribe function
   */
  onDetections(callback: (data: DetectionFrame) => void): () => void;

  /**
   * Subscribe to tracked detections (with tracking IDs)
   * @returns Unsubscribe function
   */
  onTrackedDetections(callback: (data: DetectionFrame) => void): () => void;

  /**
   * Subscribe to tracking telemetry (visual servo state)
   * @returns Unsubscribe function
   */
  onTrackingTelemetry(callback: (data: TrackingTelemetry) => void): () => void;
}
