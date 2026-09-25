import type { AudioBackend, AudioChannel, AudioClipState, AudioEngineEvent } from './types.js';
import { idleClip } from './playback-state.js';
import { clampVolume } from './volume-controller.js';
type SinkContext = AudioContext & { setSinkId?: (deviceId: string) => Promise<void> };
interface ClipRuntime { state: AudioClipState; buffer: AudioBuffer | null; source: AudioBufferSourceNode | null; gain: GainNode | null; startedAt: number; offsetMs: number; resolveEnd?: () => void }
export class WebAudioBackend implements AudioBackend {
  private context: SinkContext | null = null; private clips: Record<AudioChannel, ClipRuntime> = { VOICE: runtime('VOICE'), MUSIC: runtime('MUSIC') }; private volumes = { VOICE: 1, MUSIC: 0.6 }; private master = 1; private muted = false; private buffers = new Map<string, AudioBuffer>();
  constructor(private readonly contextFactory: () => SinkContext = () => new AudioContext() as SinkContext, private readonly emit: (event: AudioEngineEvent) => void = () => {}) {}
  async play(channel: AudioChannel, sourceId: string, url: string, durationMs: number | null, loop: boolean): Promise<void> {
    this.stop(channel); const clip = this.clips[channel]; clip.state = { channel, sourceId, state: 'LOADING', positionMs: 0, durationMs, loop, error: null };
    try { const context = this.getContext(); await context.resume(); let buffer = this.buffers.get(url); if (buffer) { this.buffers.delete(url); this.buffers.set(url, buffer); } else { const response = await fetch(url); if (!response.ok) throw new Error(`Audio fetch failed (${response.status})`); const bytes = await response.arrayBuffer(); buffer = await context.decodeAudioData(bytes); this.buffers.set(url, buffer); while (this.buffers.size > 8) this.buffers.delete(this.buffers.keys().next().value!); } clip.buffer = buffer; clip.offsetMs = 0; this.startSource(channel); }
    catch (error) { const message = error instanceof Error ? error.message.slice(0, 180) : 'Audio load failed'; clip.state = { ...clip.state, state: 'FAILED', error: message }; this.emit({ type: 'PLAYBACK_ERROR', channel, sourceId, error: message }); throw error; }
  }
  pause(channel: AudioChannel) { const c = this.clips[channel]; if (c.state.state !== 'PLAYING') return false; c.offsetMs = this.position(c); c.source?.stop(); c.source = null; c.state = { ...c.state, state: 'PAUSED', positionMs: c.offsetMs }; return true; }
  resume(channel: AudioChannel) { const c = this.clips[channel]; if (c.state.state !== 'PAUSED' || !c.buffer) return false; this.startSource(channel); return true; }
  seek(channel: AudioChannel, positionMs: number) { const c = this.clips[channel]; if (!Number.isFinite(positionMs) || positionMs < 0 || !c.buffer || !['PLAYING', 'PAUSED'].includes(c.state.state)) return false; const wasPlaying = c.state.state === 'PLAYING'; if (wasPlaying) c.source?.stop(); c.offsetMs = Math.min(c.buffer.duration * 1000, positionMs); c.state = { ...c.state, positionMs: c.offsetMs }; if (wasPlaying) this.startSource(channel); return true; }
  stop(channel?: AudioChannel) { for (const target of channel ? [channel] : ['VOICE', 'MUSIC'] as const) { const c = this.clips[target]; c.source?.stop(); c.source = null; c.resolveEnd?.(); delete c.resolveEnd; if (c.state.sourceId) c.state = { ...idleClip(target), sourceId: c.state.sourceId, state: 'STOPPED' }; c.buffer = null; c.offsetMs = 0; } }
  setVolume(channel: AudioChannel, value: number, fadeMs = 0) { this.volumes[channel] = clampVolume(value); const gain = this.clips[channel].gain; if (gain && this.context) { const now = this.context.currentTime; gain.gain.cancelScheduledValues(now); if (fadeMs > 0) gain.gain.setTargetAtTime(this.effective(channel), now, Math.max(0.001, fadeMs / 3000)); else gain.gain.setValueAtTime(this.effective(channel), now); } }
  setMasterVolume(value: number) { this.master = clampVolume(value); for (const c of ['VOICE', 'MUSIC'] as const) this.setVolume(c, this.volumes[c]); }
  mute(value: boolean) { this.muted = value; for (const c of ['VOICE', 'MUSIC'] as const) this.setVolume(c, this.volumes[c]); }
  getState(channel: AudioChannel): AudioClipState { const c = this.clips[channel]; const state = { ...c.state }; if (state.state === 'PLAYING') state.positionMs = this.position(c); return state; }
  async setOutputDevice(deviceId: string) { if (deviceId !== 'default' && !/^[-\w/=+:.]{1,300}$/u.test(deviceId)) return false; const context = this.getContext(); if (!context.setSinkId) return deviceId === 'default'; try { await context.setSinkId(deviceId); return true; } catch { return false; } }
  async close() { this.stop(); await this.context?.close(); this.context = null; }
  async unlock() { await this.getContext().resume(); }
  private getContext() { return this.context ??= this.contextFactory(); }
  private startSource(channel: AudioChannel) {
    const c = this.clips[channel]; const context = this.getContext(); const source = context.createBufferSource(); const gain = c.gain ?? context.createGain(); c.gain = gain; source.buffer = c.buffer; source.loop = c.state.loop; gain.gain.value = this.effective(channel); if (!gain.numberOfOutputs) gain.connect(context.destination); source.connect(gain); source.onended = () => { if (c.source !== source || c.state.loop) return; c.source = null; c.state = { ...c.state, state: 'STOPPED', positionMs: c.state.durationMs ?? (c.buffer ? c.buffer.duration * 1000 : c.offsetMs) }; c.resolveEnd?.(); delete c.resolveEnd; this.emit({ type: 'PLAYBACK_ENDED', channel, sourceId: c.state.sourceId! }); }; c.source = source; c.startedAt = context.currentTime; c.state = { ...c.state, state: 'PLAYING' }; source.start(0, c.offsetMs / 1000);
  }
  private position(c: ClipRuntime) { const elapsed = this.context ? (this.context.currentTime - c.startedAt) * 1000 : 0; const duration = c.buffer ? c.buffer.duration * 1000 : c.state.durationMs ?? Number.MAX_SAFE_INTEGER; return Math.max(0, Math.min(duration, c.offsetMs + elapsed)); }
  private effective(channel: AudioChannel) { return this.muted ? 0 : this.master * this.volumes[channel]; }
}
function runtime(channel: AudioChannel): ClipRuntime { return { state: idleClip(channel), buffer: null, source: null, gain: null, startedAt: 0, offsetMs: 0 }; }
