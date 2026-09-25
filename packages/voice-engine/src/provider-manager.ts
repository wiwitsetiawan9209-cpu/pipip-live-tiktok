import type { TTSProvider, TTSProviderCapabilities, TTSRequest, TTSResult, TTSVoice } from './types.js';

export class TTSProviderManager {
  private active: TTSProvider | null = null;
  constructor(private readonly providers: TTSProvider[], private readonly timeoutMs = 30_000, private readonly now = () => Date.now()) {}
  async listAvailable(): Promise<string[]> { const result: string[] = []; for (const provider of this.providers) { try { if (await provider.isAvailable()) result.push(provider.id); } catch { /* Provider health failure is isolated. */ } } return result; }
  async listVoices(): Promise<TTSVoice[]> { const result:TTSVoice[]=[];for(const provider of this.providers){try{if(!(await provider.isAvailable())||!provider.listVoices)continue;for(const voice of await provider.listVoices())result.push({...voice,id:voice.id??voice.name,provider:provider.id,locale:voice.locale??voice.language,available:voice.available??true})}catch{/* A failed provider does not hide other installed voices. */}}return result; }
  async getCapabilities():Promise<TTSProviderCapabilities[]>{const result:TTSProviderCapabilities[]=[];for(const provider of this.providers){try{const available=await provider.isAvailable();const voices=available&&provider.listVoices?await provider.listVoices():[];const declared=provider.getCapabilities?await provider.getCapabilities():{providerId:provider.id,local:true,languages:[...new Set(voices.map(v=>v.language))],formats:['wav']};result.push({...declared,providerId:provider.id,available,voiceCount:voices.length,languages:[...new Set(declared.languages)]})}catch{result.push({providerId:provider.id,available:false,local:true,languages:[],formats:['wav'],voiceCount:0})}}return result;}
  async isLanguageAvailable(language:string){const wanted=normalizeLanguage(language);return(await this.listVoices()).some(v=>normalizeLanguage(v.language)===wanted&&v.available!==false)}
  async isIndonesianVoiceAvailable(){return this.isLanguageAvailable('id-ID')}
  primaryId() { return this.providers[0]?.id ?? 'text-only'; }
  async synthesize(request: TTSRequest, signal?: AbortSignal): Promise<TTSResult> {
    const language=normalizeLanguage(request.language);let matchingProvider=false;let lastError = language==='id-id'?'NO_ID_ID_VOICE':'No voice is installed for the requested language';
    for (const provider of this.providers) {
      if (signal?.aborted) return failed(provider.id, 'Synthesis cancelled', this.now());
      try {
        if (!(await provider.isAvailable())) continue;
        const voices=provider.listVoices?await provider.listVoices():[];
        const localized=voices.filter(v=>normalizeLanguage(v.language)===language&&v.available!==false);
        if(!localized.length)continue;
        const requested=request.voice&&request.voice!=='default'&&request.voice!=='auto'?localized.find(v=>v.id===request.voice||v.name===request.voice):undefined;
        if(request.voice&&request.voice!=='default'&&request.voice!=='auto'&&!requested)continue;
        matchingProvider=true;
        this.active = provider;
        const started=this.now();const selected=requested??localized[0]!;const result = await this.withTimeout(provider.synthesize({...request,voice:selected.id??selected.name}, signal), provider, signal);
        if (result.success && result.audioRef && result.durationMs && result.durationMs > 0&&normalizeLanguage(result.actualLanguage??selected.language)===language) return {...result,synthesisLatencyMs:Math.max(0,this.now()-started)};
        if(result.success&&normalizeLanguage(result.actualLanguage??selected.language)!==language){lastError='VOICE_LANGUAGE_MISMATCH';continue;}
        lastError = result.error || 'TTS provider returned invalid audio';
      } catch (error) { lastError = error instanceof Error ? error.message.slice(0, 240) : 'TTS provider failed'; }
      finally { if (this.active === provider) this.active = null; }
    }
    const failure=failed('text-only',lastError,this.now());if(language==='id-id'&&!matchingProvider)return {...failure,error:'NO_ID_ID_VOICE: Suara Bahasa Indonesia belum tersedia.',errorCode:'NO_ID_ID_VOICE'};return failure;
  }
  async stopAll() { const active = this.active; if (active?.stop) { try { await active.stop(); } catch { /* Cancellation is best effort. */ } } }
  private async withTimeout(task: Promise<TTSResult>, provider: TTSProvider, signal?: AbortSignal): Promise<TTSResult> {
    let timer: ReturnType<typeof setTimeout> | undefined; let abort: (() => void) | undefined;
    try {
      const limits = [new Promise<TTSResult>((_, reject) => { timer = setTimeout(() => reject(new Error('TTS synthesis timed out')), this.timeoutMs); })];
      if (signal) limits.push(new Promise<TTSResult>((_, reject) => { abort = () => reject(new Error('TTS synthesis cancelled')); signal.addEventListener('abort', abort, { once: true }); }));
      return await Promise.race([task, ...limits]);
    } catch (error) { try { await provider.stop?.(); } catch { /* Stop failure does not escape. */ } throw error; }
    finally { if (timer) clearTimeout(timer); if (abort && signal) signal.removeEventListener('abort', abort); }
  }
}
function failed(providerId: string, error: string, createdAt: number): TTSResult { return { success: false, providerId, durationMs: null, format: 'wav', sampleRate: null, channels: null, createdAt, error }; }
function normalizeLanguage(language:string){return language.replaceAll('_','-').toLocaleLowerCase('en-US');}
