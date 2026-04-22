/**
 * ITrackingService - Object tracking control
 */

import type { WebTrackingCommand } from "@robo-fleet/shared/types";

export interface ITrackingService {
  /**
   * Enable autonomous tracking mode
   */
  enableTracking(): void;

  /**
   * Disable autonomous tracking mode (switch to manual)
   */
  disableTracking(): void;

  /**
   * Select a specific target to track by tracking ID
   */
  selectTarget(trackingId: number): void;

  /**
   * Clear the current tracking target
   */
  clearTarget(): void;

  /**
   * Send a raw tracking command
   */
  sendTrackingCommand(command: WebTrackingCommand): void;
}
