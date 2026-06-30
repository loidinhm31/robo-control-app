import { describe, expect, it, vi } from "vitest";
import { startAnimationFrameLoop } from "./animation-frame-loop";

describe("startAnimationFrameLoop", () => {
  it("cancels the latest scheduled frame and cannot restart after cleanup", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    const requestFrame = vi.fn((callback: FrameRequestCallback): number => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    });
    const cancelFrame = vi.fn((id: number): void => { callbacks.delete(id); });
    const draw = vi.fn();

    const stop = startAnimationFrameLoop(draw, requestFrame, cancelFrame);
    callbacks.get(1)?.(0);
    expect(draw).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenCalledTimes(2);

    const pendingCallback = callbacks.get(2);
    stop();
    expect(cancelFrame).toHaveBeenCalledWith(2);
    expect(callbacks.has(2)).toBe(false);

    stop();
    pendingCallback?.(16);
    expect(draw).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });
});
