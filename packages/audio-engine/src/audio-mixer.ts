import type { DuckingConfig } from './types.js';
import { clampVolume } from './volume-controller.js';
export class AudioMixer {
  private voiceLevel: number; private musicLevel: number; private masterLevel = 1; private muted = false; private speechActive = false;
  constructor(private readonly config: DuckingConfig, voiceLevel = 1, musicLevel = 0.6) { this.voiceLevel = clampVolume(voiceLevel); this.musicLevel = clampVolume(musicLevel); }
  duckForVoice() { this.speechActive = true; return this.levels(); }
  restoreMusic() { this.speechActive = false; return this.levels(); }
  setMusicLevel(value: number) { this.musicLevel = clampVolume(value); return this.levels(); }
  setVoiceLevel(value: number) { this.voiceLevel = clampVolume(value); return this.levels(); }
  setMasterLevel(value: number) { this.masterLevel = clampVolume(value); return this.levels(); }
  setMuted(value: boolean) { this.muted = value; return this.levels(); }
  levels() { const music = this.config.enabled && this.speechActive ? Math.max(this.config.minimumMusicLevel, Math.min(this.musicLevel, this.config.musicLevelDuringVoice)) : this.musicLevel; return { voice: this.muted ? 0 : this.voiceLevel * this.masterLevel, music: this.muted ? 0 : music * this.masterLevel, ducked: this.speechActive, muted: this.muted }; }
  getFadeTimes() { return { attackMs: this.config.attackMs, releaseMs: this.config.releaseMs, fadeDurationMs: this.config.fadeDurationMs }; }
}
