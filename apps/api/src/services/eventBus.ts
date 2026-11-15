import { EventEmitter } from "node:events";

export interface SseEvent {
  event?: string;
  data: Record<string, unknown> | string;
}

class AppEventBus extends EventEmitter {
  constructor() {
    super();
    // Allow many concurrent SSE connections
    this.setMaxListeners(100);
  }

  emitSearchEvent(searchId: string, eventData: Record<string, unknown>): void {
    this.emit(`search:${searchId}`, eventData);
  }

  onSearchEvent(
    searchId: string,
    listener: (data: Record<string, unknown>) => void,
  ): () => void {
    const eventName = `search:${searchId}`;
    this.on(eventName, listener);
    return () => {
      this.off(eventName, listener);
    };
  }

  emitRunEvent(runId: string, eventData: Record<string, unknown>): void {
    this.emit(`run:${runId}`, eventData);
  }

  onRunEvent(
    runId: string,
    listener: (data: Record<string, unknown>) => void,
  ): () => void {
    const eventName = `run:${runId}`;
    this.on(eventName, listener);
    return () => {
      this.off(eventName, listener);
    };
  }
}

export const appEventBus = new AppEventBus();
