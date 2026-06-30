export const VIDEO_STREAM_IDLE_RESET_MS = 1_500;

interface ShouldResetVideoStatsInput {
  streamEnabled: boolean;
  cameraEnabled: boolean;
  lastFrameAtMs: number | null;
  nowMs: number;
  idleResetMs?: number;
}

export function shouldResetVideoStats({
  streamEnabled,
  cameraEnabled,
  lastFrameAtMs,
  nowMs,
  idleResetMs = VIDEO_STREAM_IDLE_RESET_MS,
}: ShouldResetVideoStatsInput): boolean {
  if (!streamEnabled || !cameraEnabled) {
    return true;
  }

  if (lastFrameAtMs === null) {
    return true;
  }

  return nowMs - lastFrameAtMs >= idleResetMs;
}
