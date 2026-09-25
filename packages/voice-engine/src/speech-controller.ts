import type { SpeechCache } from './speech-cache.js';
import { createVoiceRequest } from './voice-request.js';
import { VoiceQueue } from './voice-queue.js';
import type { TTSRequestInput, VoiceConfig, VoiceControllerEvent, VoiceStatus } from './types.js';
import { TTSProviderManager } from './provider-manager.js';

export class SpeechController {
  readonly queue: VoiceQueue;
  private state: VoiceStatus['state'] = 'IDLE'; private activeId: string | null = null; private currentSpeech: string | null = null; private paused = false; private humanTakeover = false; private emergencyStopped = false; private epoch = 0; private lastError: string | null = null; private deferredReady: Extract<VoiceControllerEvent,{type:'VOICE_READY'}> | null = null;
  constructor(private readonly config: VoiceConfig, private readonly providers: TTSProviderManager, private readonly cache?: SpeechCache, private readonly emit: (event: VoiceControllerEvent) => void = () => {}, private readonly now = () => Date.now()) { this.queue = new VoiceQueue(config.maxQueueSize, now); }
  async speak(input: TTSRequestInput): Promise<{ accepted: boolean; requestId?: string; error?: string }> {
    if (!this.config.enabled || this.emergencyStopped || this.humanTakeover || this.paused) return { accepted: false, error: 'Voice is paused or disabled.' };
    let request; try { request = createVoiceRequest(input, this.config, this.now()); } catch (error) { return { accepted: false, error: error instanceof Error ? error.message : 'Invalid speech request.' }; }
    if (!this.queue.enqueue(request)) return { accepted: false, error: 'Speech queue is full or request expired.' };
    this.publish(); void this.pump(); return { accepted: true, requestId: request.id };
  }
  pause() { if (this.emergencyStopped || this.paused) return false; this.paused = true; this.queue.setPaused(true); if (this.state === 'PLAYING') { this.state = 'PAUSED'; this.emit({ type: 'VOICE_PAUSE' }); } this.publish(); return true; }
  resume() { if (this.emergencyStopped || !this.paused) return false; this.paused = false; this.queue.setPaused(false); if (this.deferredReady) { const ready=this.deferredReady;this.deferredReady=null;this.state='READY';this.emit(ready); } else if (this.state === 'PAUSED') { this.state = 'PLAYING'; this.emit({ type: 'VOICE_RESUME' }); } this.publish(); void this.pump(); return true; }
  markPlaybackStarted(requestId: string) { if (requestId !== this.activeId || this.state !== 'READY' || this.paused || this.humanTakeover || this.emergencyStopped) return false; this.state = 'PLAYING'; this.publish(); return true; }
  markPlaybackComplete(requestId: string, success = true) { if (requestId !== this.activeId || !['PLAYING', 'PAUSED', 'READY'].includes(this.state)) return false; if (!success) this.lastError = 'Audio playback failed.'; this.activeId = null; this.currentSpeech = null; this.state = success ? 'IDLE' : 'FAILED'; this.publish(); this.state = 'IDLE'; void this.pump(); return true; }
  cancel(requestId: string) { if (this.queue.cancel(requestId)) { this.publish(); return true; } if (this.activeId !== requestId) return false; this.epoch++; this.deferredReady=null; this.activeId = null; this.currentSpeech = null; this.state = 'STOPPING'; this.emit({ type: 'VOICE_STOP', requestId }); void this.providers.stopAll(); this.state = 'STOPPED'; this.publish(); this.state = 'IDLE'; void this.pump(); return true; }
  stop(clearQueue = true) { this.epoch++; this.deferredReady=null; if (clearQueue) this.queue.clear(); const id = this.activeId ?? undefined; this.activeId = null; this.currentSpeech = null; this.state = 'STOPPING'; this.emit({ type: 'VOICE_STOP', ...(id ? { requestId: id } : {}) }); void this.providers.stopAll(); this.state = 'STOPPED'; this.publish(); this.state = 'IDLE'; return true; }
  setHumanTakeover(value: boolean) { this.humanTakeover = value; this.queue.setHumanTakeover(value); if (value) this.stop(true); this.publish(); }
  emergencyStop() { this.emergencyStopped = true; this.humanTakeover = true; this.queue.stop(); this.queue.setHumanTakeover(true); this.stop(true); this.publish(); }
  resetEmergency() { this.emergencyStopped = false; this.humanTakeover = false; this.paused = false; this.queue.resume(); this.queue.setHumanTakeover(false); this.queue.setPaused(false); this.state = 'IDLE'; this.publish(); }
  clearQueue() { this.queue.clear(); this.publish(); }
  getStatus(): VoiceStatus { return { state: this.state, provider: this.providers.primaryId(), voice: this.config.voice, language: this.config.language, currentSpeech: this.currentSpeech, queueLength: this.queue.size, paused: this.paused, humanTakeover: this.humanTakeover, emergencyStopped: this.emergencyStopped, lastError: this.lastError }; }
  private async pump() {
    if (this.activeId || this.paused || this.humanTakeover || this.emergencyStopped) return;
    const request = this.queue.pop(); if (!request) { this.state = 'IDLE'; this.publish(); return; }
    const run = ++this.epoch; this.activeId = request.id; this.currentSpeech = request.text; this.state = 'PREPARING'; this.lastError = null; this.publish();
    this.state = 'SYNTHESIZING'; this.publish();
    let result;
    try {
      const cacheKey = this.cache?.key(request, this.providers.primaryId());
      result = request.cacheable && cacheKey ? await this.cache?.get(cacheKey) : undefined;
      if (!result) result = await this.providers.synthesize(request);
      if (run !== this.epoch || request.id !== this.activeId) return;
      if (result?.success && result.audioRef && result.durationMs && result.durationMs > 0) {
        if (request.cacheable && cacheKey) await this.cache?.put(cacheKey, result);
        const ready: Extract<VoiceControllerEvent,{type:'VOICE_READY'}>={ type:'VOICE_READY',requestId:request.id,audioRef:result.audioRef,durationMs:result.durationMs,providerId:result.providerId,text:request.text,sampleRate:result.sampleRate,channels:result.channels,actualVoice:result.actualVoice??request.voice,actualLanguage:result.actualLanguage??request.language,synthesisLatencyMs:result.synthesisLatencyMs??0 };
        if(this.paused){this.deferredReady=ready;this.state='PAUSED';this.publish();}else{this.state = 'READY'; this.emit(ready); this.publish();}
      } else {
        const error = result?.error ?? 'TTS unavailable; show the generated text.'; this.lastError = error; this.emit({ type: 'VOICE_TEXT_ONLY', requestId: request.id, text: request.text, error }); this.activeId = null; this.currentSpeech = null; this.state = 'IDLE'; this.publish(); void this.pump();
      }
    } catch (error) { if (run !== this.epoch) return; this.lastError = error instanceof Error ? error.message.slice(0, 240) : 'TTS failed'; this.emit({ type: 'VOICE_TEXT_ONLY', requestId: request.id, text: request.text, error: this.lastError }); this.activeId = null; this.currentSpeech = null; this.state = 'IDLE'; this.publish(); void this.pump(); }
  }
  private publish() { this.emit({ type: 'STATE', status: this.getStatus() }); }
}
