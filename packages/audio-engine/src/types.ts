export type AudioChannel = 'VOICE' | 'MUSIC';
export type AudioPlaybackState = 'IDLE' | 'LOADING' | 'PLAYING' | 'PAUSED' | 'STOPPED' | 'FAILED';
export interface AudioClipState { channel: AudioChannel; sourceId: string | null; state: AudioPlaybackState; positionMs: number; durationMs: number | null; loop: boolean; error: string | null }
export interface AudioDeviceInfo { id: string; label: string; isDefault: boolean; available: boolean }
export interface DuckingConfig { enabled: boolean; musicLevelDuringVoice: number; attackMs: number; releaseMs: number; fadeDurationMs: number; minimumMusicLevel: number }
export interface AudioConfig { enabled: boolean; outputDevice: string; masterVolume: number; voiceVolume: number; musicVolume: number; ducking: DuckingConfig; maxAssetBytes: number; }
export interface AudioBackend {
  play(channel: AudioChannel, sourceId: string, url: string, durationMs: number | null, loop: boolean): Promise<void>;
  pause(channel: AudioChannel): boolean; resume(channel: AudioChannel): boolean; stop(channel?: AudioChannel): void;
  seek(channel: AudioChannel, positionMs: number): boolean;
  setVolume(channel: AudioChannel, value: number, fadeMs?: number): void; setMasterVolume(value: number): void; mute(value: boolean): void;
  getState(channel: AudioChannel): AudioClipState; setOutputDevice(deviceId: string): Promise<boolean>;
  unlock?(): Promise<void>;
}
export type AudioEngineEvent = { type: 'PLAYBACK_ENDED' | 'PLAYBACK_ERROR'; channel: AudioChannel; sourceId: string; error?: string };
export interface AudioDeviceProvider { list(): Promise<AudioDeviceInfo[]>; set(deviceId: string): Promise<boolean> }
