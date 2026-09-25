import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolveAIConfig, OllamaProvider } from '../packages/ai-core/src/index.js';
import { AIConfigSchema, AudioConfigSchema, VoiceConfigSchema } from '../packages/protocol/src/index.js';
import { HostEngine, HostPromptBuilder } from '../packages/host-engine/src/index.js';
import { Logger } from '../packages/logging/src/index.js';
import { ProductCatalog, ProductClaimPolicy, ProductContextBuilder, ProductSelector, SQLiteProductRepository } from '../packages/product-engine/src/index.js';
import { AudienceEngine } from '../packages/audience-engine/src/index.js';
import { AutonomousOrchestrator } from '../packages/orchestrator/src/index.js';
import type { Scheduler, OrchestratorEvent } from '../packages/orchestrator/src/index.js';
import { DecisionIntelligence, JevDecisionProvider, OutputJudge } from '../packages/decision-intelligence/src/index.js';
import type { DecisionResult } from '../packages/decision-intelligence/src/index.js';
import { LiveRuntime } from '../packages/live-runtime/src/index.js';
import { AvatarEngine, MockAvatarRuntimeAdapter } from '../packages/avatar-engine/src/index.js';
import { AudioEngine, SimulatedAudioBackend } from '../packages/audio-engine/src/index.js';
import { VoiceEngine, LocalSapiTtsProvider, TextOnlyTTSFallback, WindowsOneCoreTtsProvider } from '../packages/voice-engine/src/index.js';
import { PersonalityManager } from '../packages/personality-engine/src/index.js';

type Stage = { startAt: string; endAt?: string; durationMs?: number; result?: string };
type CaseTrace = { id: string; intent: string; eventAt?: string; decision?: Stage & { route?: string; provider?: string; confidence?: number; fallback?: boolean; reasonCode?: string }; ollama?: Stage; outputJudge?: Stage; tts?: Stage & { provider?: string; language?: string }; audio?: Stage & { backend: 'simulated' }; filter?: string; completion: boolean };
class QuietScheduler implements Scheduler { schedule(_callback:()=>void,_delayMs:number){return Symbol('held-tick')} cancel(_handle:unknown){} }
const root=process.cwd();
const read=(file:string)=>JSON.parse(readFileSync(path.join(root,'config',file),'utf8')) as unknown;
const aiConfig=resolveAIConfig(AIConfigSchema.parse(read('ai.json')),process.env);
if(aiConfig.provider!=='ollama')throw new Error('Configured provider is not Ollama; refusing to change providers.');
const provider=new OllamaProvider(aiConfig.baseUrl,aiConfig.model);
const voiceConfig=VoiceConfigSchema.parse(read('voice.json'));
const audioConfig=AudioConfigSchema.parse(read('audio.json'));
const userData=path.join(process.env.APPDATA??path.join(process.env.USERPROFILE??'C:/Users/Admin','AppData/Roaming'),'ai-live-commerce-studio');
const dbPath=path.join(userData,'ai-live-commerce.sqlite');
const db=new DatabaseSync(dbPath,{readOnly:true});
const catalog=new ProductCatalog(new SQLiteProductRepository(db));
const actualProductCount=catalog.list().length;
const productContext=new ProductContextBuilder();
const claimPolicy=new ProductClaimPolicy();
const host=new HostEngine(provider,new HostPromptBuilder(path.join(root,'data/prompts/host-system.md'),path.join(root,'data/host/host-constitution.md')),new Logger(()=>undefined),Date.now,30_000,(speech,product)=>claimPolicy.validate(speech,product).ok);
const decision=new DecisionIntelligence({primary:new JevDecisionProvider(),timeoutMs:500});
const outputJudge=new class extends OutputJudge {
  current:CaseTrace|null=null;
  judge(speech:string,product?:Parameters<OutputJudge['judge']>[1]){const trace=this.current;const start=new Date().toISOString();const p=performance.now();const result=super.judge(speech,product);if(trace)trace.outputJudge={startAt:start,endAt:new Date().toISOString(),durationMs:Math.max(0,performance.now()-p),result:result.status==='PASS'?'ACCEPT':result.status,};return result;}
}();
const audience=new AudienceEngine();
const selector=new ProductSelector(catalog);
const personality=new PersonalityManager();
const personalityContext=()=>{const{id,name,style}=personality.getActive();return{id,name,style}};
const avatarRuntime=new MockAvatarRuntimeAdapter();
const avatar=new AvatarEngine(avatarRuntime);
const audioBackend=new SimulatedAudioBackend();
const audio=new AudioEngine(audioBackend,{...audioConfig,enabled:true});
let runtime!:LiveRuntime;
let active:CaseTrace|null=null;
let ttsRequestId:string|null=null;
let ttsCompletion:(()=>void)|null=null;
const audioPlayback=async(event:Extract<import('../packages/voice-engine/src/index.js').VoiceControllerEvent,{type:'VOICE_READY'}>)=>{
  if(!active)return;
  const trace=active;const id=event.requestId;ttsRequestId=id;
  if(!voice.controller.markPlaybackStarted(id)){trace.tts!.result='PLAYBACK_START_REJECTED';trace.completion=true;ttsCompletion?.();return;}
  const startAt=new Date().toISOString();const perf=performance.now();
  const started=await audio.play('VOICE',id,event.audioRef,event.durationMs,false);
  if(!started){trace.audio={startAt,endAt:new Date().toISOString(),durationMs:Math.max(0,performance.now()-perf),result:'FAILED',backend:'simulated'};trace.completion=true;ttsCompletion?.();voice.controller.markPlaybackComplete(id,false);runtime.observeSpeech(false);return;}
  trace.audio={startAt,endAt:new Date().toISOString(),durationMs:Math.max(0,performance.now()-perf),result:'STARTED',backend:'simulated'};
  runtime.observeSpeechStarted();
  await new Promise(resolve=>setTimeout(resolve,Math.min(event.durationMs,5000)));
  await audioBackend.tick('VOICE');
  const endAt=new Date().toISOString();
  trace.audio={...trace.audio,endAt,durationMs:Math.max(0,performance.now()-perf),result:'COMPLETED'};
  voice.controller.markPlaybackComplete(id,true);runtime.observeSpeech(true);trace.completion=true;ttsCompletion?.();
};
const ttsProvider=new WindowsOneCoreTtsProvider({outputDirectory:path.join(userData,'audio-cache','voice'),timeoutMs:voiceConfig.synthesisTimeoutMs});
const sapiProvider=new LocalSapiTtsProvider({outputDirectory:path.join(userData,'audio-cache','voice'),timeoutMs:voiceConfig.synthesisTimeoutMs});
const voice=new VoiceEngine([ttsProvider,sapiProvider,new TextOnlyTTSFallback()],voiceConfig,undefined,event=>{
  if(event.type==='VOICE_READY'){
    if(active){active.tts={startAt:active.tts?.startAt??new Date().toISOString(),endAt:new Date().toISOString(),durationMs:event.synthesisLatencyMs,provider:event.providerId,language:event.actualLanguage,result:'SYNTHESIS_SUCCESS'};}
    void audioPlayback(event);
  }else if(event.type==='VOICE_TEXT_ONLY'){
    if(active){active.tts={startAt:active.tts?.startAt??new Date().toISOString(),endAt:new Date().toISOString(),provider:'none',language:'id-ID',result:'SYNTHESIS_FAILED'};active.completion=true;ttsCompletion?.();}
    runtime?.observeSpeech(false);
  }
});
const quietLogger=new Logger(()=>undefined);
let orchestrator!:AutonomousOrchestrator;
const decisionMetrics:CaseTrace[]=[];
const baseDecision=decision.decide.bind(decision);
decision.decide=async(input)=>{const trace=active;const startAt=new Date().toISOString();const p=performance.now();const result=await baseDecision(input);if(trace){trace.decision={startAt,endAt:new Date().toISOString(),durationMs:Math.max(0,performance.now()-p),route:result.decision,provider:result.provider,confidence:result.confidence,fallback:result.provider==='fallback',reasonCode:result.reasonCode};decisionMetrics.push(trace);}return result};
const originalGenerate=provider.generate.bind(provider);
provider.generate=async(request)=>{const trace=active;if(trace)trace.ollama={startAt:new Date().toISOString()};try{const result=await originalGenerate(request);if(trace)trace.ollama={...trace.ollama!,endAt:new Date().toISOString(),durationMs:result.latencyMs,result:'SUCCESS'};return result}catch(error){if(trace)trace.ollama={...trace.ollama!,endAt:new Date().toISOString(),durationMs:0,result:'FAILED'};throw error}};
runtime=new LiveRuntime({
  orchestrator:{start(id){orchestrator.start(id)},stop(reason){orchestrator.stop(reason)},pause(){orchestrator.pause()},resume(){orchestrator.resume()},getState(){return orchestrator.getState()}},
  voice:{speak:async input=>{if(active)active.tts={startAt:new Date().toISOString(),result:'SYNTHESIS_PENDING',language:input.language};const started=performance.now();const result=await voice.speak({text:input.text,language:'id-ID',priority:'HIGH'});if(active?.tts)active.tts.durationMs=Math.max(0,performance.now()-started);return result},stop(clear){voice.controller.stop(clear)},setHumanTakeover(value){voice.controller.setHumanTakeover(value)},emergencyStop(){voice.controller.emergencyStop()},resetEmergency(){voice.controller.resetEmergency()},getStatus(){return voice.getStatus()}},
  music:{stop(){},getStatus(){return{playbackState:'STOPPED'}}},
  avatar:{humanTakeover(value){avatar.humanTakeover(value)},async emergencyStop(){await avatar.emergencyStop()},async resume(){await avatar.resume()},async command(command){return avatar.testCommand(command)},snapshot(){return avatar.snapshot()}},
  audience:{getStatus(){return'ready'},getQueueDepth(){return audience.size}},
  product:{getStatus(){return actualProductCount?'ready':'unknown'},hasProduct(id){return Boolean(catalog.get(id))}},
  selectProduct(id){return Boolean(catalog.get(id))},
  onEvent(event){if(event.type==='SPEECH_STARTED'&&active?.audio)active.audio.result='STARTED';},
},{sessionId:()=>`phase15a-${Date.now()}`,maxActivity:100});
const cases=[
  {id:'GREETING',intent:'GREETING',initial:true},
  {id:'PRODUCT_QUESTION',intent:'PRODUCT_QUESTION',text:'Apa manfaat produk ini?'},
  {id:'PRICE_QUESTION',intent:'PRICE_QUESTION',text:'Berapa harga produk ini?'},
  {id:'STOCK_QUESTION',intent:'STOCK_QUESTION',text:'Apakah stok produk ini tersedia?'},
  {id:'PRODUCT_RECOMMENDATION',intent:'PRODUCT_RECOMMENDATION',text:'Produk apa yang cocok untuk saya?'},
  {id:'COMPARISON',intent:'COMPARISON',text:'Apa perbedaan antara produk A dan produk B?'},
  {id:'UNKNOWN',intent:'UNKNOWN',text:'x'},
  {id:'OFF_TOPIC',intent:'OFF_TOPIC',text:'Berapa skor sepak bola tadi malam?'},
  {id:'SPAM',intent:'SPAM',text:'Klik promo https://example.invalid sekarang'},
] as const;
const traces:CaseTrace[]=cases.map(test=>({id:test.id,intent:test.intent,completion:false}));
const hostEvents:OrchestratorEvent[]=[];
orchestrator=new AutonomousOrchestrator({
  hostEngine:host,catalog,productSelector:selector,decisionIntelligence:decision,outputJudge,
  onOutputRejected(){decision.metrics.outputRejected()},
  audienceQueue:{next:()=>audience.next(),clear:()=>audience.clear(),requeue:task=>audience.requeue(task as Parameters<typeof audience.requeue>[0]),get size(){return audience.size}},
  context:()=>({recentConversation:[],humanHostPresent:false,currentScene:'AVATAR',personality:personalityContext()}),
  emit(event){hostEvents.push(event);if(event.type==='HOST_RESPONSE_READY'&&active){const trace=active;runtime.observeHostResponse(event.action);void avatar.handleHostResponse(event.result.response,event.action==='GREETING'?'MANUAL':'COMMENT',personality.getActive().id);void runtime.routeAction({type:'SPEAK',text:event.result.response.speech,language:'id-ID'}).then(accepted=>{if(!accepted&&trace.tts){trace.tts.result='VOICE_REJECTED';trace.completion=true;ttsCompletion?.();}})}},
  onDecisionRoute(route){if(active&&!active.decision)active.decision={startAt:new Date().toISOString(),endAt:new Date().toISOString(),durationMs:0,route,provider:'deterministic',confidence:1,fallback:false,reasonCode:'ROUTE_RECORDED'}},
  scheduler:new QuietScheduler(),
});
const waitForCompletion=async(trace:CaseTrace,timeoutMs=90_000)=>{if(trace.completion)return;await Promise.race([new Promise<void>(resolve=>{ttsCompletion=resolve}),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error(`Timed out waiting for ${trace.id}`)),timeoutMs))]);ttsCompletion=null};
const run=async()=>{
  await avatar.connect();
  const initial=traces[0]!;active=initial;outputJudge.current=initial;initial.eventAt=new Date().toISOString();
  await runtime.startSession();
  const greetingCount=hostEvents.filter(event=>event.type==='HOST_RESPONSE_READY').length;
  const greetingErrorCount=hostEvents.filter(event=>event.type==='ORCHESTRATOR_ERROR').length;
  await orchestrator.tick();
  if(hostEvents.filter(event=>event.type==='HOST_RESPONSE_READY').length>greetingCount)await waitForCompletion(initial);else{initial.filter=hostEvents.filter(event=>event.type==='ORCHESTRATOR_ERROR').length>greetingErrorCount?'HOST_GENERATION_FAILED':'NO_HOST_RESPONSE';initial.completion=true}
  for(let i=1;i<cases.length;i++){
    const input=cases[i]!;const trace=traces[i]!;active=trace;outputJudge.current=trace;
    const beforeState=orchestrator.getState();
    const nextPermittedAt=Math.max(beforeState?.retryAfter??0,beforeState?.lastSpeechAt===null||beforeState?.lastSpeechAt===undefined?0:beforeState.lastSpeechAt+30_000);
    const remaining=nextPermittedAt-Date.now();if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
    trace.eventAt=new Date().toISOString();
    const result=audience.ingest({source:'local_rehearsal',type:'COMMENT',text:input.text,eventId:`LOCAL_REHEARSAL:${input.id}`,timestamp:Date.now()});
    if(!result.accepted){trace.filter=result.reason;trace.completion=true;continue;}
    const before=hostEvents.filter(event=>event.type==='HOST_RESPONSE_READY').length;
    const beforeErrors=hostEvents.filter(event=>event.type==='ORCHESTRATOR_ERROR').length;
    await orchestrator.tick();
    if(hostEvents.filter(event=>event.type==='HOST_RESPONSE_READY').length>before)await waitForCompletion(trace);else{
      const newError=hostEvents.filter((event):event is Extract<OrchestratorEvent,{type:'ORCHESTRATOR_ERROR'}>=>event.type==='ORCHESTRATOR_ERROR').slice(beforeErrors).at(-1);
      if(newError)trace.filter=trace.filter??(newError.message.includes('Host output failed deterministic validation')?'OUTPUT_JUDGE_REJECT':newError.message.startsWith('INVALID AI RESPONSE:')?'HOST_SCHEMA_REJECT':'ORCHESTRATOR_ERROR');
      trace.completion=true
    }
  }
  await runtime.stopSession();await avatar.disconnect();
  return {mode:'LOCAL_PRODUCTION_REHEARSAL',tag:'LOCAL_REHEARSAL',model:aiConfig.model,provider:aiConfig.provider,requestTimeoutMs:60_000,productRows:actualProductCount,musicFolderConfigured:(JSON.parse(readFileSync(path.join(root,'config/music.json'),'utf8')) as {directories:string[]}).directories.length>0,cases:traces.map(({completion,...trace})=>({...trace,completion})),counts:{ollamaRequests:traces.filter(x=>x.ollama).length,ollamaSuccesses:traces.filter(x=>x.ollama?.result==='SUCCESS').length,ollamaFailures:traces.filter(x=>x.ollama?.result==='FAILED').length,acceptedTts:traces.filter(x=>x.tts?.result==='SYNTHESIS_SUCCESS').length,failedTts:traces.filter(x=>x.tts?.result==='SYNTHESIS_FAILED').length,audioStarted:traces.filter(x=>x.audio?.result==='STARTED'||x.audio?.result==='COMPLETED').length,audioCompleted:traces.filter(x=>x.audio?.result==='COMPLETED').length},orchestratorErrors:hostEvents.filter((event):event is Extract<OrchestratorEvent,{type:'ORCHESTRATOR_ERROR'}>=>event.type==='ORCHESTRATOR_ERROR').map(event=>({message:event.message,retryAfter:event.retryAfter})),decisionMetrics:decision.snapshot().metrics,runtime:runtime.snapshot().state,limitations:['show runtime continuity/music authority is not attached in this headless harness','simulated audio backend; physical speaker not tested','desktop renderer/WebAudioBackend not initialized','TikTok disconnected; no external output']};
};
try{console.log(JSON.stringify(await run(),null,2));}catch(error){console.log(JSON.stringify({error:error instanceof Error?error.message:'REHEARSAL_FAILED',partial:traces.map(x=>({...x,completion:undefined}))},null,2));process.exitCode=1;}finally{await runtime.shutdown();await voice.controller.stop(true);db.close();}
