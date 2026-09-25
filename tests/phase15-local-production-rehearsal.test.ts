import { describe, expect, it, vi } from 'vitest';
import { AudienceEngine, normalizeAudienceEvent } from '../packages/audience-engine/src/index.js';
import { AudienceSubmitSchema, IPCChannelSchema, LocalProductionRehearsalSetSchema } from '../packages/protocol/src/index.js';
import { OutputJudge } from '../packages/decision-intelligence/src/index.js';
import { AudioEngine, SimulatedAudioBackend } from '../packages/audio-engine/src/index.js';
import { VoiceEngine, DEFAULT_VOICE_CONFIG, type TTSProvider, type TTSRequest, type TTSResult } from '../packages/voice-engine/src/index.js';

describe('Phase 15 local production rehearsal tagging',()=>{
  it('accepts only the explicit local rehearsal control shape and IPC channels',()=>{
    expect(LocalProductionRehearsalSetSchema.parse({enabled:true})).toEqual({enabled:true});
    expect(LocalProductionRehearsalSetSchema.safeParse({enabled:true,provider:'ollama'}).success).toBe(false);
    expect(IPCChannelSchema.safeParse('local-production-rehearsal:set').success).toBe(true);
  });
  it('preserves LOCAL_REHEARSAL source and event marker through the production audience queue',()=>{
    const input=AudienceSubmitSchema.parse({source:'local_rehearsal',type:'COMMENT',text:'Halo Pipip',eventId:'LOCAL_REHEARSAL:case-1',timestamp:1000});
    const normalized=normalizeAudienceEvent(input,1000);
    expect(normalized).toMatchObject({source:'local_rehearsal',eventId:'LOCAL_REHEARSAL:case-1'});
    const audience=new AudienceEngine({now:()=>1000});
    const decision=audience.ingest(input);
    expect(decision).toMatchObject({accepted:true,intent:'GREETING'});
    expect(audience.next()?.event).toMatchObject({source:'local_rehearsal',eventId:'LOCAL_REHEARSAL:case-1'});
  });
  it('classifies punctuation-only unknown input as empty rather than misreporting queue_full',()=>{
    expect(new AudienceEngine().ingest({source:'local_rehearsal',type:'COMMENT',text:'???'})).toMatchObject({accepted:false,intent:'UNKNOWN',reason:'empty'});
  });
});

describe('Phase 15A product/output boundaries',()=>{
  const product={id:'verified-1',name:'Produk Uji',price:15000,currency:'IDR',benefits:['Mudah dibawa'],specifications:['Kapasitas 350 ml'],variants:['Hitam'],sellingPoints:['Desain ringkas'],targetAudience:[],preferredTalkingPoints:[],forbiddenClaims:[]};
  const judge=new OutputJudge();
  it.each([
    ['Harga Produk Uji Rp12.000.','unsupported_numeric_claim'],
    ['Stok Produk Uji tersedia 5 unit.','UNVERIFIED_STOCK_CLAIM'],
    ['Produk Uji berkapasitas 500 ml.','UNSUPPORTED_NUMERIC_CLAIM'],
    ['Manfaat Produk Uji tahan lama.','UNVERIFIED_BENEFIT'],
    ['Diskon Produk Uji 50%.','unsupported_promotion_or_social_proof'],
    ['Varian Produk Uji warna merah.','UNVERIFIED_VARIANT'],
    ['Produk Lain tersedia sekarang.','UNVERIFIED_STOCK_CLAIM'],
  ])('rejects unsupported product claim before speech: %s', (speech,reason)=>expect(judge.judge(speech,product)).toMatchObject({status:'REJECT',reasonCode:reason.toUpperCase()}));
  it('accepts only catalog-backed benefit and variant text',()=>{
    expect(judge.judge('Manfaat Produk Uji: mudah dibawa.',product)).toMatchObject({status:'PASS'});
    expect(judge.judge('Varian Produk Uji: Hitam.',product)).toMatchObject({status:'PASS'});
  });
  it('reports synthesis failure without emitting a ready-to-play asset',async()=>{
    const events:import('../packages/voice-engine/src/index.js').VoiceControllerEvent[]=[];
    const failing:TTSProvider={id:'test-failure',async isAvailable(){return true},async listVoices(){return[{id:'id',name:'Indonesian',language:'id-ID',available:true}]},async synthesize(request:TTSRequest):Promise<TTSResult>{return{success:false,providerId:this.id,durationMs:null,format:request.format,sampleRate:null,channels:null,createdAt:Date.now(),error:'injected failure'}}};
    const voice=new VoiceEngine([failing],{...DEFAULT_VOICE_CONFIG,language:'id-ID'},undefined,event=>events.push(event));
    expect((await voice.speak({text:'Respons uji aman.',language:'id-ID'})).accepted).toBe(true);
    await vi.waitFor(()=>expect(events.some(event=>event.type==='VOICE_TEXT_ONLY')).toBe(true));
    expect(events.some(event=>event.type==='VOICE_READY')).toBe(false);
  });
  it('keeps AudioEngine failure software-visible and fail closed',async()=>{
    const backend=new SimulatedAudioBackend(Date.now,()=>undefined,false);
    const audio=new AudioEngine(backend,{...JSON.parse(JSON.stringify({enabled:true,outputDevice:'default',masterVolume:1,voiceVolume:1,musicVolume:.5,maxAssetBytes:50_000_000,ducking:{enabled:true,musicLevelDuringVoice:.15,attackMs:100,releaseMs:250,fadeDurationMs:100,minimumMusicLevel:0}}))});
    expect(await audio.play('VOICE','faulted-audio','simulation://asset',1000)).toBe(false);
  });
});
