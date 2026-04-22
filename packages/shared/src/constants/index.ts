// Constants and helper functions

import type { JointPositions, FleetSelectCommand } from "../types";

// Joint limits for arm control
export const JOINT_LIMITS = {
  shoulder_pan: { min: -3.14, max: 3.14 },
  shoulder_lift: { min: -1.57, max: 1.57 },
  elbow_flex: { min: -2.09, max: 2.09 },
  wrist_flex: { min: -3.14, max: 3.14 },
  wrist_roll: { min: -1.57, max: 1.57 },
  gripper: { min: -3.14, max: 3.14 },
};

// Default class colors for detection visualization
export const DEFAULT_CLASS_COLORS: Record<string, string> = {
  person: "#00ff00",
  dog: "#ff00ff",
  cat: "#ff8800",
  car: "#0088ff",
  bicycle: "#ffff00",
  motorcycle: "#ff0088",
  bus: "#8800ff",
  truck: "#00ffff",
  bird: "#88ff00",
};

// Helper functions
export function createHomePosition(): JointPositions {
  return {
    shoulder_pan: 0.0,
    shoulder_lift: 0.0,
    elbow_flex: 0.0,
    wrist_flex: 0.0,
    wrist_roll: 0.0,
    gripper: 0.0,
  };
}

export function validateJointPositions(positions: JointPositions): string | null {
  const checks: Array<[keyof JointPositions, { min: number; max: number }]> = [
    ["shoulder_pan", JOINT_LIMITS.shoulder_pan],
    ["shoulder_lift", JOINT_LIMITS.shoulder_lift],
    ["elbow_flex", JOINT_LIMITS.elbow_flex],
    ["wrist_flex", JOINT_LIMITS.wrist_flex],
    ["wrist_roll", JOINT_LIMITS.wrist_roll],
    ["gripper", JOINT_LIMITS.gripper],
  ];

  for (const [joint, limits] of checks) {
    const value = positions[joint];
    if (value !== undefined && (value < limits.min || value > limits.max)) {
      return `${joint} out of range: ${value.toFixed(3)} (expected ${limits.min.toFixed(2)} to ${limits.max.toFixed(2)})`;
    }
  }

  return null;
}

export function getClassColor(className: string): string {
  return DEFAULT_CLASS_COLORS[className] || "#ffffff";
}

export function createFleetSelectCommand(entityId: string): FleetSelectCommand {
  return {
    entity_id: entityId,
    timestamp: Date.now(),
  };
}
