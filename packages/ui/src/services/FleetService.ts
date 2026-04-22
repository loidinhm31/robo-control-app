/**
 * Fleet Service Facade
 * Static class wrapping the fleet service factory getter
 */

import { getFleetService } from "../adapters/factory";
import type { FleetStatus } from "@robo-fleet/shared/types";

export class FleetService {
  static selectRover(entityId: string): void {
    getFleetService().selectRover(entityId);
  }

  static onFleetStatus(callback: (status: FleetStatus) => void): () => void {
    return getFleetService().onFleetStatus(callback);
  }
}
