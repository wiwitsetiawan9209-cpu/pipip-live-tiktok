export function clampVolume(value: number) { if (!Number.isFinite(value)) throw new Error('Volume must be a finite number'); return Math.max(0, Math.min(1, value)); }
export class VolumeController {
  private values = { master: 1, voice: 1, music: 0.6, muted: false };
  setMaster(value: number) { this.values.master = clampVolume(value); return this.get(); }
  setVoice(value: number) { this.values.voice = clampVolume(value); return this.get(); }
  setMusic(value: number) { this.values.music = clampVolume(value); return this.get(); }
  mute(value: boolean) { this.values.muted = value; return this.get(); }
  get() { return { ...this.values }; }
  output(channel: 'VOICE' | 'MUSIC', ducked = false, duckLevel = 0.18) { return this.values.muted ? 0 : this.values.master * (channel === 'VOICE' ? this.values.voice : Math.min(this.values.music, ducked ? duckLevel : 1)); }
}
