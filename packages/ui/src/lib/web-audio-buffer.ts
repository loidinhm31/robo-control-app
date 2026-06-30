import type { NormalizedAudioFrame } from "./audio-frame";
import type { AudioTimelineSource } from "./audio-timeline-scheduler";

export const createPcmAudioBuffer = (
  context: AudioContext,
  frame: NormalizedAudioFrame,
): AudioBuffer => {
  const samplesPerChannel = frame.sampleCount / frame.channels;
  const buffer = context.createBuffer(frame.channels, samplesPerChannel, frame.sampleRate);
  const pcm = new DataView(frame.pcmBytes.buffer, frame.pcmBytes.byteOffset, frame.pcmBytes.byteLength);

  for (let channel = 0; channel < frame.channels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let index = 0; index < samplesPerChannel; index++) {
      const interleavedIndex = index * frame.channels + channel;
      channelData[index] = pcm.getInt16(interleavedIndex * 2, true) / 32_768;
    }
  }
  return buffer;
};

export const createTimelineSource = (
  context: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
): AudioTimelineSource => {
  const source = context.createBufferSource();
  let onEnded: (() => void) | null = null;
  source.buffer = buffer;
  source.connect(destination);
  source.onended = () => onEnded?.();

  return {
    start: (whenSeconds) => source.start(whenSeconds),
    stop: () => source.stop(),
    dispose: () => {
      source.onended = null;
      source.disconnect();
    },
    setOnEnded: (callback) => { onEnded = callback; },
  };
};
