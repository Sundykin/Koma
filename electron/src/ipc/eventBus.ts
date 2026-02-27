type EventListener<T = unknown> = (payload: T, eventName?: string) => void;

interface ListenerEntry {
  owner: string;
  handler: EventListener;
  once: boolean;
}

export class EventBus {
  private listeners = new Map<string, ListenerEntry[]>();

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
}

export const appEventBus = new EventBus();
