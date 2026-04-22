/**
 * Service Factory
 * Uses setter/getter pattern for service initialization
 *
 * ARCHITECTURE:
 * - Services are set externally via setters (e.g., in RoboControlApp.tsx)
 * - Getters throw if service not initialized (enforces explicit setup)
 * - All services are singletons at the module level
 */

import type { ISocketService } from "./interfaces/ISocketService";
import type { IRoverCommandService } from "./interfaces/IRoverCommandService";
import type { ITrackingService } from "./interfaces/ITrackingService";
import type { IFleetService } from "./interfaces/IFleetService";
import type { ITelemetryService } from "./interfaces/ITelemetryService";
import type { IMediaService } from "./interfaces/IMediaService";
import type { IVoiceService } from "./interfaces/IVoiceService";

// Singleton instances (set via setters)
let socketService: ISocketService | null = null;
let roverCommandService: IRoverCommandService | null = null;
let trackingService: ITrackingService | null = null;
let fleetService: IFleetService | null = null;
let telemetryService: ITelemetryService | null = null;
let mediaService: IMediaService | null = null;
let voiceService: IVoiceService | null = null;

// ============= Setters =============

export const setSocketService = (service: ISocketService): void => {
  socketService = service;
};

export const setRoverCommandService = (service: IRoverCommandService): void => {
  roverCommandService = service;
};

export const setTrackingService = (service: ITrackingService): void => {
  trackingService = service;
};

export const setFleetService = (service: IFleetService): void => {
  fleetService = service;
};

export const setTelemetryService = (service: ITelemetryService): void => {
  telemetryService = service;
};

export const setMediaService = (service: IMediaService): void => {
  mediaService = service;
};

export const setVoiceService = (service: IVoiceService): void => {
  voiceService = service;
};

// ============= Getters =============

/**
 * Get the Socket Service
 * @throws Error if service not initialized
 */
export const getSocketService = (): ISocketService => {
  if (!socketService) {
    throw new Error("SocketService not initialized. Call setSocketService first.");
  }
  return socketService;
};

/**
 * Get the Rover Command Service
 * @throws Error if service not initialized
 */
export const getRoverCommandService = (): IRoverCommandService => {
  if (!roverCommandService) {
    throw new Error("RoverCommandService not initialized. Call setRoverCommandService first.");
  }
  return roverCommandService;
};

/**
 * Get the Tracking Service
 * @throws Error if service not initialized
 */
export const getTrackingService = (): ITrackingService => {
  if (!trackingService) {
    throw new Error("TrackingService not initialized. Call setTrackingService first.");
  }
  return trackingService;
};

/**
 * Get the Fleet Service
 * @throws Error if service not initialized
 */
export const getFleetService = (): IFleetService => {
  if (!fleetService) {
    throw new Error("FleetService not initialized. Call setFleetService first.");
  }
  return fleetService;
};

/**
 * Get the Telemetry Service
 * @throws Error if service not initialized
 */
export const getTelemetryService = (): ITelemetryService => {
  if (!telemetryService) {
    throw new Error("TelemetryService not initialized. Call setTelemetryService first.");
  }
  return telemetryService;
};

/**
 * Get the Media Service
 * @throws Error if service not initialized
 */
export const getMediaService = (): IMediaService => {
  if (!mediaService) {
    throw new Error("MediaService not initialized. Call setMediaService first.");
  }
  return mediaService;
};

/**
 * Get the Voice Service
 * @throws Error if service not initialized
 */
export const getVoiceService = (): IVoiceService => {
  if (!voiceService) {
    throw new Error("VoiceService not initialized. Call setVoiceService first.");
  }
  return voiceService;
};

// ============= Optional Getters =============

export const getSocketServiceOptional = (): ISocketService | null => socketService;
export const getRoverCommandServiceOptional = (): IRoverCommandService | null => roverCommandService;
export const getTrackingServiceOptional = (): ITrackingService | null => trackingService;
export const getFleetServiceOptional = (): IFleetService | null => fleetService;
export const getTelemetryServiceOptional = (): ITelemetryService | null => telemetryService;
export const getMediaServiceOptional = (): IMediaService | null => mediaService;
export const getVoiceServiceOptional = (): IVoiceService | null => voiceService;

// ============= Utilities =============

/**
 * All services interface for type safety
 */
export interface AllServices {
  socket: ISocketService;
  roverCommand: IRoverCommandService;
  tracking: ITrackingService;
  fleet: IFleetService;
  telemetry: ITelemetryService;
  media: IMediaService;
  voice: IVoiceService;
}

/**
 * Get all services as an object
 * @throws Error if any service is not initialized
 */
export const getAllServices = (): AllServices => ({
  socket: getSocketService(),
  roverCommand: getRoverCommandService(),
  tracking: getTrackingService(),
  fleet: getFleetService(),
  telemetry: getTelemetryService(),
  media: getMediaService(),
  voice: getVoiceService(),
});

/**
 * Reset all service instances (useful for testing or hot reload)
 */
export const resetServices = (): void => {
  socketService = null;
  roverCommandService = null;
  trackingService = null;
  fleetService = null;
  telemetryService = null;
  mediaService = null;
  voiceService = null;
};
