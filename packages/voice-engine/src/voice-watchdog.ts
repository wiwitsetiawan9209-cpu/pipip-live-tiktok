export type VoiceFailure = 'PROVIDER_UNAVAILABLE' | 'TTS_FAILURE' | 'SYNTHESIS_TIMEOUT' | 'INVALID_AUDIO' | 'PLAYBACK_FAILURE' | 'STUCK_PLAYBACK' | 'ZERO_DURATION' | 'QUEUE_DEADLOCK';
export interface VoiceWatchdogInput { now: number; state: string; stateSince: number; queueLength: number; activeRequestId: string | null; expectedDurationMs: number | null; playbackPositionMs: number; synthesisTimeoutMs: number; playbackGraceMs?: number }
export class VoiceWatchdog {
  inspect(input: VoiceWatchdogInput): VoiceFailure | null {
    if (input.state === 'SYNTHESIZING' && input.now - input.stateSince >= input.synthesisTimeoutMs) return 'SYNTHESIS_TIMEOUT';
    if (input.state === 'PLAYING' && input.expectedDurationMs === 0) return 'ZERO_DURATION';
    if (input.state === 'PLAYING' && input.expectedDurationMs !== null && input.now - input.stateSince > input.expectedDurationMs + (input.playbackGraceMs ?? 5000) && input.playbackPositionMs === 0) return 'STUCK_PLAYBACK';
    if (input.queueLength > 0 && !input.activeRequestId && input.state === 'IDLE') return 'QUEUE_DEADLOCK';
    return null;
  }
}
