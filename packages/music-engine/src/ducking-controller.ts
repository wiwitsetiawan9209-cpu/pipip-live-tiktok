import type { MusicConfig } from './types.js';
export interface DuckingState { voiceLevel: number; musicLevel: number; targetMusicLevel: number; fadeEndsAt: number; speechActive: boolean }

/** Phase 5 semantic ducking port, extended with optional Phase 6 attack/release. */
export class DuckingController {
  private state: DuckingState;
  constructor(private config: MusicConfig, private now = () => Date.now()) { this.state = { voiceLevel: 1, musicLevel: 0, targetMusicLevel: 0, fadeEndsAt: this.now(), speechActive: false }; }
  duckForVoice() {
    this.state.speechActive = true; this.state.voiceLevel = 1;
    const target = this.config.duckingEnabled === false ? this.config.backgroundMusicLevel : Math.max(this.config.minimumMusicLevel ?? 0, Math.min(this.config.musicDuringSpeech, this.config.backgroundMusicLevel));
    this.transition(target, this.config.attackMs ?? this.config.fadeDurationMs); return this.getState();
  }
  restoreMusic() { this.state.speechActive = false; this.state.voiceLevel = 0; this.transition(this.config.backgroundMusicLevel, this.config.releaseMs ?? this.config.fadeDurationMs); return this.getState(); }
  setMusicLevel(level: number) {
    if (!Number.isFinite(level)) throw new Error('Invalid music level');
    const safe = Math.max(0, Math.min(1, level));
    const target = this.state.speechActive && this.config.duckingEnabled !== false ? Math.max(this.config.minimumMusicLevel ?? 0, Math.min(this.config.musicDuringSpeech, safe)) : safe;
    this.transition(target); return this.getState();
  }
  setBackgroundMusicLevel(level: number) { if (!Number.isFinite(level)) throw new Error('Invalid music level'); this.config.backgroundMusicLevel = Math.max(0,Math.min(1,level)); return this.setMusicLevel(this.config.backgroundMusicLevel); }
  fadeMusicIn() { this.transition(this.config.backgroundMusicLevel); return this.getState(); }
  fadeMusicOut() { this.transition(0); return this.getState(); }
  getState() { this.advance(); return { ...this.state }; }
  private transition(level: number, durationMs = this.config.fadeDurationMs) {
    this.advance(); const cap = this.state.speechActive && this.config.duckingEnabled !== false ? this.config.musicDuringSpeech : 1;
    this.state.targetMusicLevel = Math.max(0, Math.min(cap, level)); this.state.fadeEndsAt = this.now() + Math.max(0, durationMs);
    if (!durationMs) this.state.musicLevel = this.state.targetMusicLevel;
  }
  private advance() { if (this.now() >= this.state.fadeEndsAt) this.state.musicLevel = this.state.targetMusicLevel; }
}
