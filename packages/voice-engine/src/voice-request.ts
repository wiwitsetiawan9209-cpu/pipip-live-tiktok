import { randomUUID } from 'node:crypto';
import type { TTSRequest, TTSRequestInput, VoiceConfig } from './types.js';

export function createVoiceRequest(input: TTSRequestInput, config: VoiceConfig, now = Date.now()): TTSRequest {
  const text = input.text.trim();
  if (!text || text.length > 4000) throw new Error('Speech text must contain 1 to 4000 characters');
  const language = input.language?.trim() || config.language;
  const voice = input.voice?.trim() || config.voice;
  const speed = input.speed ?? config.speed;
  const pitch = input.pitch ?? config.pitch;
  if (language.length > 35 || voice.length > 100 || !Number.isFinite(speed) || speed < 0.5 || speed > 2 || !Number.isFinite(pitch) || pitch < -12 || pitch > 12) throw new Error('Invalid voice settings');
  const priority = input.priority ?? 'NORMAL';
  if (!['EMERGENCY', 'HIGH', 'NORMAL', 'LOW'].includes(priority)) throw new Error('Invalid speech priority');
  const ttlMs = input.ttlMs ?? config.requestTtlMs;
  if (!Number.isInteger(ttlMs) || ttlMs < 100 || ttlMs > 3_600_000) throw new Error('Invalid speech request lifetime');
  return { id: randomUUID(), text, language, voice, speed, pitch, ...(input.emotion ? { emotion: input.emotion.slice(0, 40) } : {}), format: 'wav', priority, createdAt: now, expiresAt: now + ttlMs, cacheable: input.cacheable ?? true };
}
