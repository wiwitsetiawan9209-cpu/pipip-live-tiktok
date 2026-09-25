export type VoicePriority = 'EMERGENCY' | 'HIGH' | 'NORMAL' | 'LOW';
export type SpeechState = 'IDLE' | 'PREPARING' | 'SYNTHESIZING' | 'READY' | 'PLAYING' | 'PAUSED' | 'STOPPING' | 'STOPPED' | 'FAILED';
export interface TTSRequest {
  id: string; text: string; language: string; voice: string; speed: number; pitch: number;
  emotion?: string; format: 'wav'; sampleRate?: number; priority: VoicePriority;
  createdAt: number; expiresAt: number; cacheable: boolean;
}
export interface TTSRequestInput {
  text: string; language?: string; voice?: string; speed?: number; pitch?: number; emotion?: string;
  priority?: VoicePriority; ttlMs?: number; cacheable?: boolean;
}
export interface TTSResult {
  success: boolean; providerId: string; audioRef?: string; durationMs: number | null;
  format: 'wav'; sampleRate: number | null; channels: number | null; createdAt: number;
  actualVoice?: string; actualLanguage?: string; synthesisLatencyMs?: number; error?: string; errorCode?: 'NO_ID_ID_VOICE' | 'VOICE_LANGUAGE_MISMATCH' | 'TTS_FAILURE';
}
export interface TTSVoice { id?: string; provider?: string; name: string; locale?: string; language: string; gender?: string; age?: string; available?: boolean; quality?: string; capabilities?: string[] }
export interface TTSProviderCapabilities { providerId: string; available: boolean; local: boolean; languages: string[]; formats: string[]; voiceCount: number }
export interface TTSProvider {
  id: string;
  isAvailable(): Promise<boolean>;
  synthesize(request: TTSRequest, signal?: AbortSignal): Promise<TTSResult>;
  listVoices?(): Promise<TTSVoice[]>;
  getCapabilities?(): Promise<Omit<TTSProviderCapabilities, 'available' | 'voiceCount'>>;
  stop?(): Promise<void>;
}
export interface VoiceConfig { enabled: boolean; provider: string; language: string; voice: string; speed: number; pitch: number; volume: number; requestTtlMs: number; maxQueueSize: number; maxRetries: number; synthesisTimeoutMs: number; cacheEnabled: boolean; cacheMaxEntries: number }
export interface VoiceStatus { state: SpeechState; provider: string; voice: string; language: string; currentSpeech: string | null; queueLength: number; paused: boolean; humanTakeover: boolean; emergencyStopped: boolean; lastError: string | null }
export type VoiceControllerEvent =
  | { type: 'STATE'; status: VoiceStatus }
  | { type: 'VOICE_READY'; requestId: string; audioRef: string; durationMs: number; providerId: string; text: string; sampleRate:number|null; channels:number|null; actualVoice:string; actualLanguage:string; synthesisLatencyMs:number }
  | { type: 'VOICE_STOP'; requestId?: string }
  | { type: 'VOICE_PAUSE' | 'VOICE_RESUME' }
  | { type: 'VOICE_TEXT_ONLY'; requestId: string; text: string; error: string };
