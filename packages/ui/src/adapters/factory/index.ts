// Service Factory exports

export {
  // Setters
  setSocketService,
  setRoverCommandService,
  setTrackingService,
  setFleetService,
  setTelemetryService,
  setMediaService,
  setVoiceService,
  // Getters
  getSocketService,
  getRoverCommandService,
  getTrackingService,
  getFleetService,
  getTelemetryService,
  getMediaService,
  getVoiceService,
  // Optional getters
  getSocketServiceOptional,
  getRoverCommandServiceOptional,
  getTrackingServiceOptional,
  getFleetServiceOptional,
  getTelemetryServiceOptional,
  getMediaServiceOptional,
  getVoiceServiceOptional,
  // Utilities
  getAllServices,
  resetServices,
  type AllServices,
} from "./ServiceFactory";

// Re-export interfaces
export * from "./interfaces";
