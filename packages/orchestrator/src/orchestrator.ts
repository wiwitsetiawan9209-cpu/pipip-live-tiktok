import type { HostContext, HostGenerationResult, HostRequest } from '../../shared-types/src/index.js';
import type { HostEngine } from '../../host-engine/src/index.js';
import { ProductCatalog, ProductContextBuilder, ProductSelector, SalesStrategyEngine, type Product, type SalesStage } from '../../product-engine/src/index.js';
import { Cooldown } from './cooldown.js';
import { DecisionEngine } from './decision-engine.js';
import { TimeoutScheduler } from './scheduler.js';
import type { AudienceStateProvider, AutonomousAction, CooldownConfig, HumanPresenceProvider, LiveSessionState, OrchestratorEvent, Scheduler, ShowRuntimePort } from './types.js';
import type { ShowRuntimePlan } from './types.js';
import type {DecisionIntelligence,OutputJudge} from '../../decision-intelligence/src/index.js';
import {verifiedProductAnswer} from '../../decision-intelligence/src/index.js';
import {hostResponseToCommands} from '../../host-engine/src/index.js';
type AudienceTaskLike={event:{text:string;source?:string;type?:string;timestamp?:number};intent:string;mode:string};

const defaultCooldowns:CooldownConfig={tickMs:15_000,globalSpeechMs:30_000,productIntroMs:90_000,repeatedProductMs:180_000,backoffMs:5_000,backoffMaxMs:60_000};
export interface OrchestratorOptions {
  hostEngine:Pick<HostEngine,'generate'>; catalog:ProductCatalog; productSelector:ProductSelector;
  context:()=>Pick<HostContext,'recentConversation'|'humanHostPresent'>&Partial<Pick<HostContext,'currentScene'|'humanHostState'|'currentTopic'|'audienceCount'|'personality'|'knowledgeContext'|'policyContext'>>;
  emit:(event:OrchestratorEvent)=>void; scheduler?:Scheduler; now?:()=>number; cooldowns?:Partial<CooldownConfig>;
  decisionEngine?:DecisionEngine; salesStrategy?:SalesStrategyEngine; productContextBuilder?:ProductContextBuilder;
  audienceProvider?:AudienceStateProvider; humanPresenceProvider?:HumanPresenceProvider;
  audienceQueue?:{next:()=>AudienceTaskLike|undefined;clear:()=>void;requeue?:(task:AudienceTaskLike)=>boolean;size?:number};
  audienceKnowledge?:(task:AudienceTaskLike)=>Promise<{status:string;summary?:string}>;
  decisionIntelligence?:DecisionIntelligence;outputJudge?:OutputJudge;onOutputRejected?:()=>void;onToolRejected?:()=>void;onDecisionRoute?:(route:string)=>void;onDecisionEscalated?:()=>void;
  showRuntime?:ShowRuntimePort;
  lastAudienceEventAt?:()=>number|null;
}
export class AutonomousOrchestrator {
  private state:LiveSessionState|null=null; private timer:unknown=null; private ticking=false;private queuedDecisions=new WeakSet<object>();
  private readonly scheduler:Scheduler; private readonly now:()=>number; private readonly cooldowns:CooldownConfig; private readonly clock:Cooldown;
  private readonly decision:DecisionEngine; private readonly strategy:SalesStrategyEngine; private readonly productContext:ProductContextBuilder;
  constructor(private readonly options:OrchestratorOptions){this.scheduler=options.scheduler??new TimeoutScheduler();this.now=options.now??(()=>Date.now());this.cooldowns={...defaultCooldowns,...options.cooldowns};this.clock=new Cooldown(this.now);this.decision=options.decisionEngine??new DecisionEngine();this.strategy=options.salesStrategy??new SalesStrategyEngine();this.productContext=options.productContextBuilder??new ProductContextBuilder();}
  start(sessionId:number|string):LiveSessionState {
    if(this.state?.running){if(this.state.paused)this.resume();return this.getState()!;}
    const now=this.now();this.state={sessionId,running:true,paused:false,startedAt:now,lastActionAt:null,lastSpeechAt:null,lastProductId:null,currentProductId:null,productsDiscussed:[],lastProductIntroAt:null,currentIntent:null,currentProductStage:null,nextProductStageIndex:0,productMentions:[],greeted:false,hostState:'IDLE',humanPresence:this.options.humanPresenceProvider?.getState()??'UNKNOWN',audience:this.options.audienceProvider?.getState()??{kind:'UNKNOWN'},failureCount:0,retryAfter:null};
    this.options.showRuntime?.start(now);
    this.emit({type:'LIVE_STARTED',timestamp:now,sessionId});this.emit({type:'AUTONOMY_ENABLED',timestamp:now,sessionId});this.schedule(0);return this.getState()!;
  }
  stop(reason:'live'|'autonomy'='autonomy'):void {const state=this.state;if(!state?.running)return;this.options.decisionIntelligence?.cancelPending();this.clearTimer();this.options.audienceQueue?.clear();this.options.showRuntime?.stop();state.running=false;state.paused=false;state.currentIntent='WAIT';state.hostState='IDLE';if(reason==='live')this.emit({type:'LIVE_STOPPED',timestamp:this.now(),sessionId:state.sessionId});else this.emit({type:'AUTONOMY_DISABLED',timestamp:this.now(),sessionId:state.sessionId});}
  pause():void {const state=this.state;if(!state?.running||state.paused)return;this.options.decisionIntelligence?.cancelPending();this.clearTimer();this.options.audienceQueue?.clear();this.queuedDecisions=new WeakSet<object>();this.options.showRuntime?.pause();state.paused=true;state.currentIntent='WAIT';state.hostState='PAUSED';this.emit({type:'AI_PAUSED',timestamp:this.now(),sessionId:state.sessionId});}
  resume():void {const state=this.state;if(!state?.running||!state.paused)return;this.options.showRuntime?.resume();state.paused=false;state.hostState='IDLE';state.currentIntent=null;this.emit({type:'AI_RESUMED',timestamp:this.now(),sessionId:state.sessionId});this.schedule(Math.max(this.cooldowns.tickMs,this.clock.remaining(state.lastSpeechAt===null?null:state.lastSpeechAt+this.cooldowns.globalSpeechMs)));}
  getState():LiveSessionState|null {return this.state?{...this.state,productsDiscussed:[...this.state.productsDiscussed],productMentions:this.state.productMentions.map(x=>({...x})),audience:{...this.state.audience}}:null;}
  async tick():Promise<void> {
    const state=this.state;if(!state?.running||state.paused||this.ticking)return;this.clearTimer();this.ticking=true;
    try{
      state.audience=this.options.audienceProvider?.getState()??{kind:'UNKNOWN'};state.humanPresence=this.options.humanPresenceProvider?.getState()??'UNKNOWN';
      const now=this.now();const available=this.options.catalog.active();let current:Product|null=state.currentProductId?this.options.catalog.get(state.currentProductId):null;
      if(this.options.showRuntime){const base=this.options.context();const planResult=await this.options.showRuntime.advance({now,sessionId:state.sessionId,sessionStartedAt:state.startedAt,sessionDurationMs:Math.max(0,now-state.startedAt),lastHostSpeechAt:state.lastSpeechAt,lastAudienceEventAt:this.options.lastAudienceEventAt?.()??null,greeted:state.greeted,pendingAudience:this.options.audienceQueue?.size??0,availableProductIds:available.map(x=>x.id),currentTopic:base.currentTopic??null,personality:base.personality?.style??'balanced',paused:state.paused,humanTakeover:state.humanPresence==='HUMAN_PRESENT',stopped:!state.running});if(!state.running||state.paused)return;if(planResult.kind==='MUSIC_PLAYING')return;if(planResult.kind==='HOST'){if(this.clock.active(state.lastSpeechAt===null?null:state.lastSpeechAt+this.cooldowns.globalSpeechMs))return;await this.runShowAction(planResult.plan,state);return;}}
      const speechBlocked=this.clock.active(state.lastSpeechAt===null?null:state.lastSpeechAt+this.cooldowns.globalSpeechMs);
      const audienceTask=state.greeted&&!speechBlocked?this.options.audienceQueue?.next():undefined;
      if(audienceTask){
        state.currentIntent='AUDIENCE_COMMENT';state.lastActionAt=now;state.hostState='THINKING';
        const base=this.options.context();const mentioned=available.filter(product=>audienceTask.event.text.toLocaleLowerCase('id-ID').includes(product.name.toLocaleLowerCase('id-ID')));const factProduct=current??(mentioned.length===1?mentioned[0]!:null);const audienceProduct=factProduct&&factProduct.status==='ACTIVE'?this.productContext.build(factProduct):undefined;
        let route='LLM_FAST';let result:HostGenerationResult|undefined;
        if(this.options.decisionIntelligence){const decision=await this.options.decisionIntelligence.decide({eventType:audienceTask.event.type??'COMMENT',source:audienceTask.event.source??'unknown',text:audienceTask.event.text,intent:audienceTask.intent,productContext:factProduct?{productId:factProduct.id,verified:true}:undefined,hostState:state.hostState,liveState:state.running?'RUNNING':'STOPPED',musicState:'UNKNOWN',audienceState:state.audience.kind,allowedActions:['RESPOND','IGNORE','QUEUE','ESCALATE','DETERMINISTIC','LLM_FAST','LLM_STRONG'],timestamp:audienceTask.event.timestamp??now});if(!state.running||state.paused)return;route=decision.decision;this.options.onDecisionRoute?.(route);
          if(route==='IGNORE'){state.hostState='IDLE';state.currentIntent='WAIT';return;}
          if(route==='QUEUE'){if(!this.queuedDecisions.has(audienceTask)&&this.options.audienceQueue?.requeue?.(audienceTask))this.queuedDecisions.add(audienceTask);else this.options.onDecisionEscalated?.();state.hostState='IDLE';state.currentIntent='WAIT';return;}
          if(route==='TOOL'){this.options.onToolRejected?.();state.hostState='IDLE';state.currentIntent='WAIT';return;}
          if(route==='ESCALATE'||route==='REJECT'){this.options.onDecisionEscalated?.();state.hostState='IDLE';state.currentIntent='WAIT';return;}
          if(route==='RESPOND')route='LLM_FAST';
          if(route==='DETERMINISTIC'){const speech=factProduct?verifiedProductAnswer(audienceTask.intent as import('../../audience-engine/src/index.js').AudienceIntent,factProduct):null;if(!speech){this.options.onDecisionEscalated?.();state.hostState='IDLE';state.currentIntent='WAIT';return;}const response={speech,emotion:'friendly' as const,gesture:'point_product' as const,scene:'PRODUCT' as const,intent:'answer' as const};result={ok:true,response,commands:hostResponseToCommands(response),provider:'product-engine',model:'deterministic',latencyMs:Math.max(0,this.now()-now)};}
          else if(route!=='LLM_FAST'&&route!=='LLM_STRONG'){this.options.onDecisionEscalated?.();state.hostState='IDLE';state.currentIntent='WAIT';return;}
        }
        const advice=result?undefined:await this.options.audienceKnowledge?.(audienceTask);if(!state.running||state.paused)return;const request:HostRequest={type:'HOST_RESPONSE',trigger:'COMMENT',context:{...base,sessionId:state.sessionId,...(audienceProduct?{currentProduct:audienceProduct}:{}),recentConversation:[...base.recentConversation.slice(-10),{role:'audience',text:audienceTask.event.text,timestamp:new Date(now).toISOString()}],audienceContext:{intent:audienceTask.intent,mode:audienceTask.mode,comment:audienceTask.event.text},personality:base.personality,knowledgeContext:advice??base.knowledgeContext,policyContext:base.policyContext},instruction:`Respond briefly to the audience comment. Decision route: ${route}. Intent: ${audienceTask.intent}; response mode: ${audienceTask.mode}. Use only verified product data if present; otherwise be transparent.`};
        result??=await this.generateHost(request);
        if(!state.running||state.paused)return;
        if(result.ok&&!this.outputAllowed(result,request.context.currentProduct)){this.rejectOutput(state);return;}
        if(!result.ok){state.failureCount++;state.hostState='ERROR';const wait=Math.min(this.cooldowns.backoffMs*2**Math.min(state.failureCount-1,10),this.cooldowns.backoffMaxMs);state.retryAfter=this.now()+wait;state.currentIntent='WAIT';this.emit({type:'ORCHESTRATOR_ERROR',timestamp:this.now(),sessionId:state.sessionId,message:result.message,retryAfter:state.retryAfter});return;}
        const finished=this.now();state.hostState='SPEAKING';state.failureCount=0;state.retryAfter=null;state.lastSpeechAt=finished;state.lastActionAt=finished;
        this.emit({type:'HOST_RESPONSE_READY',timestamp:finished,sessionId:state.sessionId,action:'AUDIENCE_COMMENT',productId:null,productName:null,result});this.emit({type:'HOST_ACTION_EMITTED',timestamp:finished,sessionId:state.sessionId,action:'AUDIENCE_COMMENT',productId:null});return;
      }
      if(current&&(current.status!=='ACTIVE'||current.stock===0)){state.currentProductId=null;state.currentProductStage=null;state.nextProductStageIndex=0;current=null;}
      const productBlocked=state.lastProductIntroAt!==null&&now-state.lastProductIntroAt<this.cooldowns.productIntroMs;
      const decision=this.decision.decide(state,{now,productAvailable:available.length>0,product:current,globalCooldown:this.clock.active(state.lastSpeechAt===null?null:state.lastSpeechAt+this.cooldowns.globalSpeechMs),productCooldown:productBlocked,backoff:this.clock.active(state.retryAfter)});
      state.currentIntent=decision.action;state.lastActionAt=now;
      if(decision.action==='WAIT'||decision.action==='IDLE'){if(decision.reason==='global_speech_cooldown')this.emit({type:'COOLDOWN_STARTED',timestamp:now,sessionId:state.sessionId,until:state.lastSpeechAt!+this.cooldowns.globalSpeechMs,kind:'speech'});return;}
      let product=current;
      if(decision.action==='PRODUCT_INTRO'){
        const hostContext=this.options.context();const conversation=hostContext.recentConversation.slice(-12).map(x=>x.text).join(' ');
        const selected=this.options.productSelector.select({conversation,repeatedProductCooldownMs:this.cooldowns.repeatedProductMs,...(hostContext.currentTopic?{audienceIntent:hostContext.currentTopic}:{})});
        if(!selected){state.currentIntent='WAIT';return;}product=this.options.catalog.get(selected.productId);
        if(!product){state.currentIntent='WAIT';return;}
        try{this.productContext.build(product);}catch{state.currentIntent='WAIT';return;}
        const changed=state.lastProductId!==null&&state.lastProductId!==product.id;
        this.emit({type:changed?'PRODUCT_CHANGED':'PRODUCT_SELECTED',timestamp:this.now(),sessionId:state.sessionId,productId:product.id,productName:product.name});
      }
      if(decision.action!=='GREETING'&&!product){state.currentIntent='WAIT';return;}
      state.hostState='THINKING';const request=this.makeRequest(decision.action,state.sessionId,product);
      const result=await this.generateHost(request);
      // A human pause or LIVE stop may happen while the provider is generating. Never publish stale autonomous speech afterward.
      if(!state.running||state.paused)return;
      if(!result.ok){state.failureCount++;state.hostState='ERROR';const wait=Math.min(this.cooldowns.backoffMs*2**Math.min(state.failureCount-1,10),this.cooldowns.backoffMaxMs);state.retryAfter=this.now()+wait;state.currentIntent='WAIT';this.emit({type:'ORCHESTRATOR_ERROR',timestamp:this.now(),sessionId:state.sessionId,message:result.message,retryAfter:state.retryAfter});this.emit({type:'COOLDOWN_STARTED',timestamp:this.now(),sessionId:state.sessionId,until:state.retryAfter,kind:'backoff'});return;}
      if(!this.outputAllowed(result,request.context.currentProduct)){this.rejectOutput(state);return;}
      const finished=this.now();state.hostState='SPEAKING';state.failureCount=0;state.retryAfter=null;state.lastSpeechAt=finished;state.lastActionAt=finished;
      if(decision.action==='GREETING')state.greeted=true;
      if(decision.action==='PRODUCT_INTRO'&&product){state.lastProductId=product.id;state.currentProductId=product.id;state.currentProductStage='INTRO';state.nextProductStageIndex=0;state.lastProductIntroAt=finished;state.productsDiscussed.push(product.id);state.productsDiscussed=Array.from(new Set(state.productsDiscussed));}
      else if(product&&state.currentProductId){const sequence=this.followUps(product);state.nextProductStageIndex++;if(decision.action==='CTA'||state.nextProductStageIndex>=sequence.length){state.currentProductId=null;state.currentProductStage=null;state.nextProductStageIndex=0;}else state.currentProductStage='FOLLOW_UP';}
      if(product&&decision.action!=='GREETING'){state.productMentions.push({productId:product.id,at:finished});state.productMentions=state.productMentions.slice(-50);}
      this.emit({type:'HOST_RESPONSE_READY',timestamp:finished,sessionId:state.sessionId,action:decision.action,productId:product?.id??null,productName:product?.name??null,result});
      this.emit({type:'HOST_ACTION_EMITTED',timestamp:finished,sessionId:state.sessionId,action:decision.action,productId:product?.id??null});
    }catch(error){if(this.state?.running){const currentState=this.state;currentState.failureCount++;currentState.hostState='ERROR';const wait=Math.min(this.cooldowns.backoffMs*2**Math.min(currentState.failureCount-1,10),this.cooldowns.backoffMaxMs);currentState.retryAfter=this.now()+wait;currentState.currentIntent='WAIT';this.emit({type:'ORCHESTRATOR_ERROR',timestamp:this.now(),sessionId:currentState.sessionId,message:error instanceof Error?error.message:'Orchestrator failure',retryAfter:currentState.retryAfter});}}
    finally{this.ticking=false;if(this.state?.running&&!this.state.paused)this.schedule(this.nextDelay());}
  }
  private async runShowAction(plan:ShowRuntimePlan,state:LiveSessionState){const base=this.options.context();state.currentIntent=plan.action;state.lastActionAt=this.now();state.hostState='THINKING';const request:HostRequest={type:'HOST_RESPONSE',trigger:plan.action,context:{...base,sessionId:state.sessionId,recentConversation:base.recentConversation.slice(-12),...(plan.context?{musicContext:plan.context}:{}),...(plan.showContext?{showContext:plan.showContext}:{})},instruction:plan.instruction};const result=await this.generateHost(request);if(!state.running||state.paused)return;const allowed=result.ok?this.outputAllowed(result,request.context.currentProduct):false;await this.options.showRuntime?.complete(plan,allowed);if(!result.ok){state.failureCount++;state.hostState='ERROR';const wait=Math.min(this.cooldowns.backoffMs*2**Math.min(state.failureCount-1,10),this.cooldowns.backoffMaxMs);state.retryAfter=this.now()+wait;state.currentIntent='WAIT';this.emit({type:'ORCHESTRATOR_ERROR',timestamp:this.now(),sessionId:state.sessionId,message:result.message,retryAfter:state.retryAfter});return;}if(!allowed){this.rejectOutput(state);return;}const finished=this.now();state.hostState='SPEAKING';state.failureCount=0;state.retryAfter=null;state.lastSpeechAt=finished;state.lastActionAt=finished;this.emit({type:'HOST_RESPONSE_READY',timestamp:finished,sessionId:state.sessionId,action:plan.action,productId:null,productName:null,result});this.emit({type:'HOST_ACTION_EMITTED',timestamp:finished,sessionId:state.sessionId,action:plan.action,productId:null});}
  private outputAllowed(result:Extract<HostGenerationResult,{ok:true}>,product?:HostContext['currentProduct']):boolean{return !this.options.outputJudge||this.options.outputJudge.judge(result.response.speech,product).status==='PASS';}
  private rejectOutput(state:LiveSessionState):void{this.options.onOutputRejected?.();state.failureCount++;state.hostState='ERROR';state.currentIntent='WAIT';state.retryAfter=this.now()+this.cooldowns.backoffMs;this.emit({type:'ORCHESTRATOR_ERROR',timestamp:this.now(),sessionId:state.sessionId,message:'Host output failed deterministic validation',retryAfter:state.retryAfter});}
  private async generateHost(request:HostRequest):Promise<HostGenerationResult>{this.options.showRuntime?.speechStarted();try{return await this.options.hostEngine.generate(request)}finally{this.options.showRuntime?.speechFinished()}}
  private makeRequest(action:AutonomousAction,sessionId:number|string,product:Product|null):HostRequest {
    const base=this.options.context();const hostContext:HostContext={...base,sessionId,recentConversation:base.recentConversation.slice(-12),currentProduct:product?this.productContext.build(product):undefined};
    const requestedStage:SalesStage|undefined=action==='PRODUCT_INTRO'?'HOOK':action==='PRODUCT_BENEFIT'?'BENEFIT':action==='PRODUCT_DETAIL'?'SPECIFICATION':action==='PRODUCT_PRICE'?'PRICE':action==='CTA'?'CTA':undefined;
    const plan=product?this.strategy.plan(product,{...(requestedStage?{requestedStage}:{}),conversation:base.currentTopic??''}):null;
    const trigger:HostRequest['trigger']=action==='PRODUCT_INTRO'?'PRODUCT_INTRO':action==='PRODUCT_DETAIL'||action==='PRODUCT_PRICE'?'PRODUCT_DEMO':'MANUAL';
    const instruction=action==='GREETING'?'Sapa audience secara singkat. Jangan mengarang jumlah atau interaksi penonton.':`Autonomous action: ${action}. Sales stage: ${plan?.stage??action}. Use only verified catalog facts. Suggested talking point: ${plan?.talkingPoint??'keep the response natural and brief; do not add unsupported facts.'}`;
    return {type:'HOST_RESPONSE',trigger,context:hostContext,instruction};
  }
  private followUps(product:Product){const stages:(AutonomousAction)[]=[];if(product.benefits.length)stages.push('PRODUCT_BENEFIT');if(product.specifications.length)stages.push('PRODUCT_DETAIL');if(product.price!==null||product.promoPrice!==null)stages.push('PRODUCT_PRICE');stages.push('CTA');return stages;}
  private nextDelay():number {const state=this.state;if(!state)return this.cooldowns.tickMs;const backoff=this.clock.remaining(state.retryAfter);const speech=this.clock.remaining(state.lastSpeechAt===null?null:state.lastSpeechAt+this.cooldowns.globalSpeechMs);const product=state.currentProductId===null?this.clock.remaining(state.lastProductIntroAt===null?null:state.lastProductIntroAt+this.cooldowns.productIntroMs):0;const base=Math.max(this.cooldowns.tickMs,backoff,speech,product);const music=this.options.showRuntime?.nextWakeDelay(this.now());return music===null||music===undefined?base:Math.max(10,Math.min(base,music));}
  private schedule(delay:number):void {this.clearTimer();if(!this.state?.running||this.state.paused)return;this.timer=this.scheduler.schedule(()=>{this.timer=null;void this.tick();},delay);}
  private clearTimer():void {if(this.timer!==null){this.scheduler.cancel(this.timer);this.timer=null;}}
  private emit(event:OrchestratorEvent):void {this.options.emit(event);}
}
