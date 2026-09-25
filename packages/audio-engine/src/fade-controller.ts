import { clampVolume } from './volume-controller.js';
export class FadeController {
  constructor(private readonly now = () => Date.now()) {}
  transition(from: number, to: number, durationMs: number) { if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 30_000) throw new Error('Invalid fade duration'); const start = this.now(); const initial = clampVolume(from); const target = clampVolume(to); return { startAt: start, endAt: start + durationMs, valueAt: (time: number) => durationMs === 0 || time >= start + durationMs ? target : time <= start ? initial : initial + (target - initial) * ((time - start) / durationMs) }; }
}
