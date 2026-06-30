import type { LongTaskObserverStatus } from "./audio-stream-metrics";

export interface LongTaskObservation {
  status: LongTaskObserverStatus;
  disconnect: () => void;
}

export const observeLongTasks = (
  enabled: boolean,
  onLongTask: (durationMs: number) => void,
): LongTaskObservation => {
  if (!enabled) return { status: "disabled", disconnect: () => undefined };
  if (typeof PerformanceObserver === "undefined") {
    return { status: "unsupported", disconnect: () => undefined };
  }

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) onLongTask(entry.duration);
    });
    observer.observe({ type: "longtask", buffered: true });
    return { status: "observing", disconnect: () => observer.disconnect() };
  } catch {
    return { status: "unsupported", disconnect: () => undefined };
  }
};
