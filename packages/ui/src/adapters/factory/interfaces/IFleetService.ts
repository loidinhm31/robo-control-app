/**
 * IFleetService - Fleet management and rover selection
 */

import type { FleetStatus } from "@robo-fleet/shared/types";

export interface IFleetService {
  /**
   * Select a rover to control
   * @param entityId The rover's entity ID
   */
  selectRover(entityId: string): void;

  /**
   * Subscribe to fleet status updates
   * @returns Unsubscribe function
   */
  onFleetStatus(callback: (status: FleetStatus) => void): () => void;
}
