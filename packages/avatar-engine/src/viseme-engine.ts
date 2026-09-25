import type {SpeechTimingProvider,VisemeEvent} from './types.js';
/** Timing-only placeholder. It deliberately does not infer phonemes or mouth shapes. */
export class MockSpeechTimingProvider implements SpeechTimingProvider {getSpeechTiming(speechText:string,durationMs:number,startedAt=0):VisemeEvent[]{if(!speechText.trim()||!Number.isFinite(durationMs)||durationMs<=0)return[];return[{timestampMs:Math.max(0,startedAt),durationMs:Math.round(durationMs),viseme:'speech',weight:1}]}}
