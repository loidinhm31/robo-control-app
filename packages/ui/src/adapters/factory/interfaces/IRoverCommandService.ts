/**
 * IRoverCommandService - Sending movement and arm commands to the rover
 */

import type { WebRoverCommand, WebArmCommand } from "@robo-fleet/shared/types";

export interface CommandAck {
  commandsSent: number;
  commandsReceived: number;
}

export interface IRoverCommandService {
  /**
   * Send a rover movement command (velocity or wheel positions)
   */
  sendRoverCommand(command: WebRoverCommand): void;

  /**
   * Send an arm command (joint positions, home, stop)
   */
  sendArmCommand(command: WebArmCommand): void;

  /**
   * Trigger emergency stop - stops both rover and arm immediately
   */
  emergencyStop(): void;

  /**
   * Send arm to home position
   */
  sendHome(): void;

  /**
   * Subscribe to command acknowledgments
   * @returns Unsubscribe function
   */
  onCommandAck(callback: (ack: CommandAck) => void): () => void;
}
