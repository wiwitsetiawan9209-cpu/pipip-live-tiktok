import type { VoiceConfig } from './types.js';
export const DEFAULT_VOICE_CONFIG: VoiceConfig = { enabled: true, provider: 'local-sapi', language: 'en-US', voice: 'default', speed: 1, pitch: 0, volume: 1, requestTtlMs: 60_000, maxQueueSize: 40, maxRetries: 1, synthesisTimeoutMs: 30_000, cacheEnabled: true, cacheMaxEntries: 200 };
export function clampVoiceVolume(value: number) { if (!Number.isFinite(value)) throw new Error('Invalid voice volume'); return Math.max(0, Math.min(1, value)); }
