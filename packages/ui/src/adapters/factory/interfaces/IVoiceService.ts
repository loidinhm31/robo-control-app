/**
 * IVoiceService - Text-to-speech and walkie-talkie audio streaming
 */

export interface IVoiceService {
  /**
   * Send text to be spoken by the rover's TTS
   * @param text The text to speak
   */
  sendTTS(text: string): void;

  /**
   * Stream audio data to the rover (walkie-talkie)
   * @param audioData PCM audio data as byte array
   */
  streamAudio(audioData: number[]): void;
}
