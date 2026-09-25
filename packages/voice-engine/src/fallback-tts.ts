import type { TTSProvider, TTSRequest, TTSResult } from './types.js';
/** Safe final fallback: explicitly reports text-only instead of fabricating audio. */
export class TextOnlyTTSFallback implements TTSProvider {
  readonly id = 'text-only';
  async isAvailable() { return false; }
  async synthesize(_request: TTSRequest): Promise<TTSResult> { return { success: false, providerId: this.id, durationMs: null, format: 'wav', sampleRate: null, channels: null, createdAt: Date.now(), error: 'Audio is unavailable; speech remains visible as text.' }; }
}
