import type { TTSRequest } from './types.js';
const ranks = { EMERGENCY: 4, HIGH: 3, NORMAL: 2, LOW: 1 } as const;
export class VoiceQueue {
  private items: TTSRequest[] = []; private paused = false; private takeover = false; private stopped = false;
  constructor(private readonly maxSize = 40, private readonly now = () => Date.now()) {}
  enqueue(request: TTSRequest) { this.expire(); if (this.paused || this.takeover || this.stopped || request.expiresAt <= this.now() || this.items.length >= this.maxSize || this.items.some(x => key(x) === key(request))) return false; this.items.push({ ...request }); this.items.sort((a, b) => ranks[b.priority] - ranks[a.priority] || a.createdAt - b.createdAt || a.id.localeCompare(b.id)); return true; }
  pop() { this.expire(); return this.paused || this.takeover || this.stopped ? undefined : this.items.shift(); }
  cancel(id: string) { const before = this.items.length; this.items = this.items.filter(x => x.id !== id); return before !== this.items.length; }
  clear() { this.items = []; }
  setPaused(value: boolean) { this.paused = value; }
  setHumanTakeover(value: boolean) { this.takeover = value; }
  stop() { this.stopped = true; this.clear(); }
  resume() { this.stopped = false; }
  list() { this.expire(); return this.items.map(x => ({ ...x })); }
  get size() { this.expire(); return this.items.length; }
  private expire() { this.items = this.items.filter(x => x.expiresAt > this.now()); }
}
function key(request: TTSRequest) { return `${request.text.toLocaleLowerCase()}|${request.voice}|${request.language}`; }
