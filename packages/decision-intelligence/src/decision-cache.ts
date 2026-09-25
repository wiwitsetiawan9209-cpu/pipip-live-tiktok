import type {DecisionRequest,DecisionResult} from './types.js';
export class DecisionCache {
  private entries=new Map<string,{expiresAt:number;result:DecisionResult}>();
  constructor(private readonly ttlMs=5_000,private readonly maxEntries=100,private readonly now=()=>Date.now()){}
  key(request:DecisionRequest){return JSON.stringify([request.eventType,request.source,request.intent,request.productContext?.productId,request.productContext?.verified,request.liveState,request.hostState,request.musicState,request.audienceState,request.allowedActions?.slice().sort()])}
  get(request:DecisionRequest):DecisionResult|undefined{const entry=this.entries.get(this.key(request));if(!entry)return undefined;if(entry.expiresAt<=this.now()){this.entries.delete(this.key(request));return undefined}return structuredClone(entry.result)}
  set(request:DecisionRequest,result:DecisionResult){if(request.text||request.eventType==='EMERGENCY_STOP'||request.eventType==='HUMAN_TAKEOVER')return false;const key=this.key(request);this.entries.delete(key);this.entries.set(key,{expiresAt:this.now()+Math.max(0,this.ttlMs),result:structuredClone(result)});while(this.entries.size>this.maxEntries)this.entries.delete(this.entries.keys().next().value!);return true}
  invalidate(){this.entries.clear()}
  get size(){return this.entries.size}
}
