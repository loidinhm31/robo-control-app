import { afterEach, describe, expect, it, vi } from "vitest";
import { observeLongTasks } from "./audio-long-task-observer";

afterEach(() => vi.unstubAllGlobals());

describe("observeLongTasks", () => {
  it("stays disabled when diagnostics are not enabled", () => {
    expect(observeLongTasks(false, vi.fn()).status).toBe("disabled");
  });

  it("reports unsupported runtimes explicitly", () => {
    vi.stubGlobal("PerformanceObserver", undefined);

    expect(observeLongTasks(true, vi.fn()).status).toBe("unsupported");
  });

  it("observes durations and disconnects cleanly", () => {
    const disconnect = vi.fn();
    const observe = vi.fn();
    let callback: PerformanceObserverCallback | undefined;
    class FakePerformanceObserver {
      constructor(next: PerformanceObserverCallback) { callback = next; }
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal("PerformanceObserver", FakePerformanceObserver);
    const onLongTask = vi.fn();

    const observation = observeLongTasks(true, onLongTask);
    callback?.(
      { getEntries: () => [{ duration: 55 }] } as PerformanceObserverEntryList,
      {} as PerformanceObserver,
    );
    observation.disconnect();

    expect(observation.status).toBe("observing");
    expect(observe).toHaveBeenCalledWith({ type: "longtask", buffered: true });
    expect(onLongTask).toHaveBeenCalledWith(55);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("reports unsupported when observer registration throws", () => {
    class ThrowingPerformanceObserver {
      constructor(_callback: PerformanceObserverCallback) {}
      observe(): void { throw new Error("longtask unavailable"); }
      disconnect(): void {}
    }
    vi.stubGlobal("PerformanceObserver", ThrowingPerformanceObserver);

    expect(observeLongTasks(true, vi.fn()).status).toBe("unsupported");
  });
});
