/**
 * Rover Command Service Facade
 * Static class wrapping the rover command service factory getter
 */

import { getRoverCommandService } from "../adapters/factory";
import type { WebRoverCommand, WebArmCommand } from "@robo-fleet/shared/types";
import type { CommandAck } from "../adapters/factory/interfaces";

export class RoverCommandService {
  static sendRoverCommand(command: WebRoverCommand): void {
    getRoverCommandService().sendRoverCommand(command);
  }

  static sendArmCommand(command: WebArmCommand): void {
    getRoverCommandService().sendArmCommand(command);
  }

  static emergencyStop(): void {
    getRoverCommandService().emergencyStop();
  }

  static sendHome(): void {
    getRoverCommandService().sendHome();
  }

  static onCommandAck(callback: (ack: CommandAck) => void): () => void {
    return getRoverCommandService().onCommandAck(callback);
  }
}
