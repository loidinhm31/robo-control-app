/**
 * Tracking Service Facade
 * Static class wrapping the tracking service factory getter
 */

import { getTrackingService } from "../adapters/factory";
import type { WebTrackingCommand } from "@robo-fleet/shared/types";

export class TrackingService {
  static enableTracking(): void {
    getTrackingService().enableTracking();
  }

  static disableTracking(): void {
    getTrackingService().disableTracking();
  }

  static selectTarget(trackingId: number): void {
    getTrackingService().selectTarget(trackingId);
  }

  static clearTarget(): void {
    getTrackingService().clearTarget();
  }

  static sendTrackingCommand(command: WebTrackingCommand): void {
    getTrackingService().sendTrackingCommand(command);
  }
}
