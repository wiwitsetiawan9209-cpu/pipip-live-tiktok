import type { AudioBackend, AudioChannel, AudioClipState, AudioPlaybackState } from './types.js';
import { idleClip } from './playback-state.js';
import { clampVolume } from './volume-controller.js';
export type AudioEvent = { type: 'PLAYBACK_ENDED' | 'PLAYBACK_ERROR'; channel: AudioChannel; sourceId: string; error?: string };
export class SimulatedAudioBackend implements AudioBackend {
  private clips = { VOICE: idleClip('VOICE'), MUSIC: idleClip('MUSIC') }; private started = { VOICE: 0, MUSIC: 0 }; private volume = { VOICE: 1, MUSIC: 0.6 }; private master = 1; private muted = false;
  constructor(private now = () => Date.now(), private emit: (event: AudioEvent) => void = () => {}, private deviceAvailable = true) {}
  async play(channel: AudioChannel, sourceId: string, _url: string, durationMs: number | null, loop: boolean) { if (!this.deviceAvailable) throw new Error('Audio device unavailable'); if (durationMs === 0) throw new Error('Zero-duration audio is invalid'); const clip: AudioClipState = { channel, sourceId, state: 'PLAYING', positionMs: 0, durationMs, loop, error: null }; this.clips[channel] = clip; this.started[channel] = this.now(); }
  pause(channel: AudioChannel) { const clip = this.clips[channel]; if (clip.state !== 'PLAYING') return false; clip.positionMs = this.position(channel); clip.state = 'PAUSED'; return true; }
  resume(channel: AudioChannel) { const clip = this.clips[channel]; if (clip.state !== 'PAUSED') return false; this.started[channel] = this.now() - clip.positionMs; clip.state = 'PLAYING'; return true; }
  stop(channel?: AudioChannel) { for (const target of channel ? [channel] : ['VOICE', 'MUSIC'] as const) { const clip = this.clips[target]; if (clip.sourceId) { this.clips[target] = { ...idleClip(target), state: 'STOPPED', sourceId: clip.sourceId }; } } }
  seek(channel: AudioChannel, positionMs: number) { const clip = this.clips[channel]; if (!Number.isFinite(positionMs) || positionMs < 0 || clip.durationMs === null || clip.state === 'IDLE') return false; clip.positionMs = Math.min(clip.durationMs, positionMs); this.started[channel] = this.now() - clip.positionMs; return true; }
  setVolume(channel: AudioChannel, value: number) { this.volume[channel] = clampVolume(value); }
  setMasterVolume(value: number) { this.master = clampVolume(value); }
  mute(value: boolean) { this.muted = value; }
  getState(channel: AudioChannel) { const clip = { ...this.clips[channel] }; if (clip.state === 'PLAYING') clip.positionMs = this.position(channel); return clip; }
  async setOutputDevice(deviceId: string) { return deviceId === 'default' && this.deviceAvailable; }
  async tick(channel: AudioChannel) { const clip = this.clips[channel]; if (clip.state !== 'PLAYING' || clip.loop || clip.durationMs === null || this.now() - this.started[channel] < clip.durationMs) return false; clip.state = 'STOPPED'; clip.positionMs = clip.durationMs; this.emit({ type: 'PLAYBACK_ENDED', channel, sourceId: clip.sourceId! }); return true; }
  getEffectiveVolume(channel: AudioChannel) { return this.muted ? 0 : this.master * this.volume[channel]; }
  fail(channel: AudioChannel, error: string) { const clip = this.clips[channel]; clip.state = 'FAILED' as AudioPlaybackState; clip.error = error.slice(0, 180); if (clip.sourceId) this.emit({ type: 'PLAYBACK_ERROR', channel, sourceId: clip.sourceId, error: clip.error }); }
  private position(channel: AudioChannel) { const clip = this.clips[channel]; return Math.max(0, Math.min(clip.durationMs ?? Number.MAX_SAFE_INTEGER, this.now() - this.started[channel])); }
}
