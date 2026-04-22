/**
 * Media Service Facade
 * Static class wrapping the media service factory getter
 */

import { getMediaService } from "../adapters/factory";
import type { DetectionFrame, TrackingTelemetry } from "@robo-fleet/shared/types";
import type { JPEGVideoFrame, AudioFrame } from "../adapters/factory/interfaces";

export class MediaService {
  static startCamera(): void {
    getMediaService().startCamera();
  }

  static stopCamera(): void {
    getMediaService().stopCamera();
  }

  static startAudioCapture(): void {
    getMediaService().startAudioCapture();
  }

  static stopAudioCapture(): void {
    getMediaService().stopAudioCapture();
  }

  static enablePerformanceMonitoring(enabled: boolean): void {
    getMediaService().enablePerformanceMonitoring(enabled);
  }

  static onVideoFrame(callback: (frame: JPEGVideoFrame) => void): () => void {
    return getMediaService().onVideoFrame(callback);
  }

  static onAudioFrame(callback: (frame: AudioFrame) => void): () => void {
    return getMediaService().onAudioFrame(callback);
  }

  static onDetections(callback: (data: DetectionFrame) => void): () => void {
    return getMediaService().onDetections(callback);
  }

  static onTrackedDetections(callback: (data: DetectionFrame) => void): () => void {
    return getMediaService().onTrackedDetections(callback);
  }

  static onTrackingTelemetry(callback: (data: TrackingTelemetry) => void): () => void {
    return getMediaService().onTrackingTelemetry(callback);
  }
}
