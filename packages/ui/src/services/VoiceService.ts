/**
 * Voice Service Facade
 * Static class wrapping the voice service factory getter
 */

import { getVoiceService } from "../adapters/factory";

export class VoiceService {
  static sendTTS(text: string): void {
    getVoiceService().sendTTS(text);
  }

  static streamAudio(audioData: number[]): void {
    getVoiceService().streamAudio(audioData);
  }
}
