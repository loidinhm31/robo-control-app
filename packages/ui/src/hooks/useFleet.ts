/**
 * useFleet - Subscribe to fleet status and control rover selection
 */

import { useState, useEffect, useCallback } from "react";
import { FleetService } from "../services";
import type { FleetStatus } from "@robo-fleet/shared/types";

export interface UseFleetReturn {
  status: FleetStatus | null;
  selectedEntity: string | null;
  roster: string[];
  selectRover: (entityId: string) => void;
}

export const useFleet = (): UseFleetReturn => {
  const [status, setStatus] = useState<FleetStatus | null>(null);

  useEffect(() => {
    try {
      const unsubscribe = FleetService.onFleetStatus(setStatus);
      return unsubscribe;
    } catch {
      // Service not initialized yet
      return () => {};
    }
  }, []);

  const selectRover = useCallback((entityId: string) => {
    FleetService.selectRover(entityId);
  }, []);

  return {
    status,
    selectedEntity: status?.selected_entity ?? null,
    roster: status?.fleet_roster ?? [],
    selectRover,
  };
};
