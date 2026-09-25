import type { AudioChannel, AudioClipState } from './types.js';
export function idleClip(channel: AudioChannel): AudioClipState { return { channel, sourceId: null, state: 'IDLE', positionMs: 0, durationMs: null, loop: false, error: null }; }
