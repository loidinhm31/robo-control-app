type RequestFrame = (callback: FrameRequestCallback) => number;
type CancelFrame = (handle: number) => void;

export const startAnimationFrameLoop = (
  callback: () => void,
  requestFrame: RequestFrame = requestAnimationFrame,
  cancelFrame: CancelFrame = cancelAnimationFrame,
): (() => void) => {
  let frameId: number | null = null;
  let stopped = false;

  const animate = (): void => {
    if (stopped) return;
    callback();
    if (!stopped) frameId = requestFrame(animate);
  };

  frameId = requestFrame(animate);
  return () => {
    stopped = true;
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
  };
};
