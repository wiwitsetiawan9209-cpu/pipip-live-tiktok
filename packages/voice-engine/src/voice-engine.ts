import { SpeechController } from './speech-controller.js';
import type { TTSProvider } from './types.js';
import { TTSProviderManager } from './provider-manager.js';
import { DEFAULT_VOICE_CONFIG } from './voice-settings.js';
import type { VoiceConfig, VoiceControllerEvent, TTSRequestInput } from './types.js';
import type { SpeechCache } from './speech-cache.js';
export class VoiceEngine {
  readonly controller: SpeechController;
  readonly providers: TTSProviderManager;
  constructor(providers: TTSProvider[], config: VoiceConfig = DEFAULT_VOICE_CONFIG, cache?: SpeechCache, emit?: (event: VoiceControllerEvent) => void, now?: () => number) { this.providers = new TTSProviderManager(providers, config.synthesisTimeoutMs, now); this.controller = new SpeechController(config, this.providers, cache, emit, now); }
  speak(input: TTSRequestInput) { return this.controller.speak(input); }
  getStatus() { return this.controller.getStatus(); }
}
