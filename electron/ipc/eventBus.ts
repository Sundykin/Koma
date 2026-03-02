type EventListener<T = unknown> = (payload: T, eventName?: string) => void;

interface ListenerEntry {
  owner: string;
  handler: EventListener;
  once: boolean;
}

// ── Replay buffer types ──
interface ReplayEntry {
  eventName: string;
  payload: unknown;
  timestamp: number;
}

const REPLAY_BUFFER_SIZE = 50;
const REPLAY_WINDOW_MS = 30_000;

/** Event prefixes considered critical and stored in the replay buffer */
const CRITICAL_PREFIXES = ['workflow:', 'provider:', 'project:', 'plugin:'];

function isCritical(eventName: string): boolean {
  return CRITICAL_PREFIXES.some(p => eventName.startsWith(p));
}

export class EventBus {
  private listeners = new Map<string, ListenerEntry[]>();
  private replayBuffer: ReplayEntry[] = [];

  on<T = unknown>(eventName: string, owner: string, handler: EventListener<T>): () => void {
    const entries = this.listeners.get(eventName) || [];
    entries.push({ owner, handler: handler as EventListener, once: false });
    this.listeners.set(eventName, entries);
    return () => this.off(eventName, owner, handler as EventListener);
  }

  once<T = unknown>(eventName: string, owner: string, handler: EventListener<T>): () => void {
    const entries = this.listeners.get(eventName) || [];
    entries.push({ owner, handler: handler as EventListener, once: true });
    this.listeners.set(eventName, entries);
    return () => this.off(eventName, owner, handler as EventListener);
  }

  off(eventName: string, owner: string, handler?: EventListener): void {
    const entries = this.listeners.get(eventName);
    if (!entries?.length) return;

    const next = entries.filter((entry) => {
      if (entry.owner !== owner) return true;
      if (!handler) return false;
      return entry.handler !== handler;
    });

    if (next.length) {
      this.listeners.set(eventName, next);
    } else {
      this.listeners.delete(eventName);
    }
  }

  clearOwner(owner: string): void {
    for (const [eventName, entries] of this.listeners.entries()) {
      const next = entries.filter((entry) => entry.owner !== owner);
      if (next.length) {
        this.listeners.set(eventName, next);
      } else {
        this.listeners.delete(eventName);
      }
    }
  }

  emit<T = unknown>(eventName: string, payload: T): void {
    // Store critical events in replay buffer
    if (isCritical(eventName)) {
      this.pushReplay(eventName, payload);
    }

    const wildcardDomain = `${eventName.split(':')[0]}:*`;
    const exactListeners = (this.listeners.get(eventName) || []).map((entry) => ({
      sourceEvent: eventName,
      entry,
    }));
    const wildcardListeners = (this.listeners.get(wildcardDomain) || []).map((entry) => ({
      sourceEvent: wildcardDomain,
      entry,
    }));

    const all = [...exactListeners, ...wildcardListeners];
    for (const { sourceEvent, entry } of all) {
      try {
        entry.handler(payload, eventName);
      } catch (error) {
        console.error(`[EventBus] listener error for ${eventName}:`, error);
      }
      if (entry.once) {
        this.off(sourceEvent, entry.owner, entry.handler);
      }
    }
  }

  /**
   * Replay recent critical events to a new subscriber.
   * Delivers all buffered events matching the pattern within the replay window.
   */
  replay(eventPattern: string, owner: string, handler: EventListener): () => void {
    const cutoff = Date.now() - REPLAY_WINDOW_MS;
    const isWildcard = eventPattern.endsWith(':*');
    const prefix = isWildcard ? eventPattern.slice(0, -1) : null;

    for (const entry of this.replayBuffer) {
      if (entry.timestamp < cutoff) continue;
      const match = prefix
        ? entry.eventName.startsWith(prefix)
        : entry.eventName === eventPattern;
      if (match) {
        try {
          handler(entry.payload, entry.eventName);
        } catch (error) {
          console.error(`[EventBus] replay error for ${entry.eventName}:`, error);
        }
      }
    }

    // Subscribe for future events
    return this.on(eventPattern, owner, handler);
  }

  /** Get replay buffer snapshot (for debugging) */
  getReplayBuffer(): ReadonlyArray<Readonly<ReplayEntry>> {
    return this.replayBuffer;
  }

  private pushReplay(eventName: string, payload: unknown): void {
    this.replayBuffer.push({ eventName, payload, timestamp: Date.now() });

    // Evict old entries beyond buffer size
    if (this.replayBuffer.length > REPLAY_BUFFER_SIZE) {
      this.replayBuffer = this.replayBuffer.slice(-REPLAY_BUFFER_SIZE);
    }

    // Evict entries outside replay window
    const cutoff = Date.now() - REPLAY_WINDOW_MS;
    const firstValid = this.replayBuffer.findIndex(e => e.timestamp >= cutoff);
    if (firstValid > 0) {
      this.replayBuffer = this.replayBuffer.slice(firstValid);
    }
  }
}

export const appEventBus = new EventBus();
