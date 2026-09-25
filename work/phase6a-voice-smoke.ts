import { WindowsOneCoreTtsProvider } from '../packages/voice-engine/src/providers/windows-onecore-tts.js';
import { INDONESIAN_PRONUNCIATION_PHRASES } from '../packages/voice-engine/src/indonesian-normalizer.js';
import { createVoiceRequest, DEFAULT_VOICE_CONFIG } from '../packages/voice-engine/src/index.js';
const provider = new WindowsOneCoreTtsProvider({ outputDirectory: 'C:/Users/Admin/Downloads/Pipip Live Tiktok/work/phase6a-voice-smoke' });
const voices = await provider.listVoices();
const voice = voices.find(v => v.language.toLowerCase() === 'id-id');
const results = [];
for (const text of INDONESIAN_PRONUNCIATION_PHRASES) {
  const result = await provider.synthesize(createVoiceRequest({text, language:'id-ID', voice:voice?.id, cacheable:false}, {...DEFAULT_VOICE_CONFIG, language:'id-ID', voice:'auto'}));
  results.push({text, success:result.success, voice:result.actualVoice, language:result.actualLanguage, durationMs:result.durationMs, sampleRate:result.sampleRate, channels:result.channels, latencyMs:result.synthesisLatencyMs, error:result.errorCode??result.error});
}
console.log(JSON.stringify({voice,results}, null, 2));
if (!voice || results.some(x=>!x.success||x.language!=='id-ID'||!x.durationMs||!x.sampleRate)) process.exitCode=1;
