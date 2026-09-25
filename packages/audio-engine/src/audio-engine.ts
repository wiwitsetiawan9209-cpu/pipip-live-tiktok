import type { AudioBackend, AudioChannel, AudioClipState, AudioConfig } from './types.js';
import { AudioMixer } from './audio-mixer.js';
import { clampVolume } from './volume-controller.js';
export class AudioEngine {
  readonly mixer: AudioMixer;
  private emergencyStopped = false;
  constructor(private readonly backend: AudioBackend, config: AudioConfig) { this.mixer = new AudioMixer(config.ducking, config.voiceVolume, config.musicVolume); this.mixer.setMasterLevel(config.masterVolume); }
  async play(channel: AudioChannel, sourceId: string, url: string, durationMs: number | null, loop = false) { if (this.emergencyStopped) return false; if (channel === 'VOICE' && this.backend.getState('VOICE').state === 'PLAYING') this.backend.stop('VOICE'); const levels = this.mixer.levels(); this.backend.setVolume('VOICE', levels.voice); this.backend.setVolume('MUSIC', levels.music); try { await this.backend.play(channel, sourceId, url, durationMs, loop); return true; } catch { return false; } }
  pause(channel: AudioChannel) { return this.backend.pause(channel); }
  resume(channel: AudioChannel) { return !this.emergencyStopped && this.backend.resume(channel); }
  seek(channel: AudioChannel, positionMs: number) { return this.backend.seek(channel, positionMs); }
  async setOutputDevice(id: string) { return this.backend.setOutputDevice(id); }
  async unlock() { try { await this.backend.unlock?.(); return true; } catch { return false; } }
  stop(channel?: AudioChannel) { this.backend.stop(channel); if (channel === 'VOICE') this.mixer.restoreMusic(); }
  speechStarted() { const levels = this.mixer.duckForVoice(); this.backend.setVolume('MUSIC', levels.music, this.mixer.getFadeTimes().attackMs); this.backend.setVolume('VOICE', levels.voice); return levels; }
  speechFinished() { const levels = this.mixer.restoreMusic(); this.backend.setVolume('MUSIC', levels.music, this.mixer.getFadeTimes().releaseMs); return levels; }
  setMasterVolume(value: number, fadeMs = 0) { const levels = this.mixer.setMasterLevel(clampVolume(value)); this.backend.setMasterVolume(1); this.backend.setVolume('VOICE', levels.voice, fadeMs); this.backend.setVolume('MUSIC', levels.music, fadeMs); return levels; }
  setVoiceVolume(value: number, fadeMs = 0) { const levels = this.mixer.setVoiceLevel(clampVolume(value)); this.backend.setVolume('VOICE', levels.voice, fadeMs); return levels; }
  setMusicVolume(value: number, fadeMs = 0) { const levels = this.mixer.setMusicLevel(clampVolume(value)); this.backend.setVolume('MUSIC', levels.music, fadeMs); return levels; }
  mute(value: boolean) { const levels = this.mixer.setMuted(value); this.backend.mute(value); return levels; }
  emergencyStop() { this.emergencyStopped = true; this.stop(); this.backend.mute(true); }
  resetEmergency() { this.emergencyStopped = false; this.backend.mute(false); }
  getState(channel: AudioChannel): AudioClipState { return this.backend.getState(channel); }
  isEmergencyStopped() { return this.emergencyStopped; }
}
