export type AudioFailure = 'PLAYBACK_FAILURE' | 'MISSING_AUDIO_FILE' | 'UNSUPPORTED_FORMAT' | 'DEVICE_UNAVAILABLE' | 'TTS_FAILURE' | 'STUCK_PLAYBACK' | 'ZERO_DURATION' | 'QUEUE_DEADLOCK' | 'SYNTHESIS_TIMEOUT';
export interface AudioWatchdogInput { state: string; now: number; stateSince: number; durationMs: number | null; positionMs: number; queueLength: number; activeRequest: boolean; fileAvailable?: boolean; deviceAvailable?: boolean; supportedFormat?: boolean; synthesisTimeoutMs?: number; graceMs?: number }
export class AudioWatchdog {
  inspect(x: AudioWatchdogInput): AudioFailure | null {
    if (x.fileAvailable === false) return 'MISSING_AUDIO_FILE'; if (x.deviceAvailable === false) return 'DEVICE_UNAVAILABLE'; if (x.supportedFormat === false) return 'UNSUPPORTED_FORMAT';
    if (x.state === 'FAILED') return 'PLAYBACK_FAILURE'; if (x.state === 'SYNTHESIZING' && x.now - x.stateSince >= (x.synthesisTimeoutMs ?? 30_000)) return 'SYNTHESIS_TIMEOUT';
    if (x.state === 'PLAYING' && x.durationMs === 0) return 'ZERO_DURATION'; if (x.state === 'PLAYING' && x.durationMs !== null && x.now - x.stateSince > x.durationMs + (x.graceMs ?? 5000) && x.positionMs === 0) return 'STUCK_PLAYBACK';
    if (x.queueLength > 0 && !x.activeRequest && x.state === 'IDLE') return 'QUEUE_DEADLOCK'; return null;
  }
}
