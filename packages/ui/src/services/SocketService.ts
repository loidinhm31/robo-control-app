/**
 * Socket Service Facade
 * Static class wrapping the socket service factory getter
 */

import { getSocketService } from "../adapters/factory";
import type { ConnectionStatus, SocketAuth } from "../adapters/factory/interfaces";

export class SocketService {
  static connect(url: string, auth?: SocketAuth): void {
    getSocketService().connect(url, auth);
  }

  static disconnect(): void {
    getSocketService().disconnect();
  }

  static getStatus(): ConnectionStatus {
    return getSocketService().getStatus();
  }

  static onStatusChange(
    callback: (status: ConnectionStatus, clientId?: string) => void
  ): () => void {
    return getSocketService().onStatusChange(callback);
  }

  static emit(event: string, data: unknown): void {
    getSocketService().emit(event, data);
  }

  static on<T = unknown>(event: string, handler: (data: T) => void): () => void {
    return getSocketService().on(event, handler);
  }
}
