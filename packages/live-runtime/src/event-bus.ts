import type { RuntimeEvent, RuntimeEventMap, RuntimeEventName } from './types.js';

export class RuntimeEventBus {
  private listeners = new Map<RuntimeEventName, Set<(event: RuntimeEvent) => void>>();
  private sequence = 0;
  private history: RuntimeEvent[] = [];
  constructor(private readonly now = () => Date.now(), private readonly maxHistory = 500) {}
  emit<K extends RuntimeEventName>(type: K, payload: RuntimeEventMap[K]): RuntimeEvent<K> {
    const event = { type, timestamp: this.now(), sequence: ++this.sequence, payload } as RuntimeEvent<K>;
    this.history.push(event as RuntimeEvent);
    if (this.history.length > this.maxHistory) this.history.splice(0, this.history.length - this.maxHistory);
    for (const listener of this.listeners.get(type) ?? []) listener(event as RuntimeEvent);
    return event;
  }
  on<K extends RuntimeEventName>(type: K, listener: (event: RuntimeEvent<K>) => void): () => void {
    const entries = this.listeners.get(type) ?? new Set();
    entries.add(listener as (event: RuntimeEvent) => void);
    this.listeners.set(type, entries);
    return () => { entries.delete(listener as (event: RuntimeEvent) => void); if (!entries.size) this.listeners.delete(type); };
  }
  getHistory(): RuntimeEvent[] { return this.history.map(event => structuredClone(event)); }
  get sequenceNumber(): number { return this.sequence; }
  clear(): void { this.listeners.clear(); this.history = []; }
}
