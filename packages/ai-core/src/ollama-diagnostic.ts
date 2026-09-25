import {HostResponseSchema} from '../../protocol/src/index.js';
import type {AIResponse} from '../../shared-types/src/index.js';
import type {AIProvider} from './index.js';

export type OllamaDiagnosticState='READY'|'OLLAMA_UNAVAILABLE'|'MODEL_NOT_FOUND'|'TIMEOUT'|'MALFORMED_RESPONSE'|'EMPTY_RESPONSE'|'REQUEST_FAILED';
export interface OllamaDiagnosticReport {state:OllamaDiagnosticState;model:string|null;reachable:boolean;modelAvailable:boolean|null;requestSucceeded:boolean;responseReceived:boolean;nonEmpty:boolean;latencyMs:number|null;totalLatencyMs:number;checkedAt:string}

const request={systemPrompt:'Return exactly one JSON object and no Markdown. Required keys: speech (non-empty string), emotion (one of neutral, friendly, excited, happy, curious, surprised, serious, playful), gesture (one of idle, talking, wave, point_product, point_human, laugh, think, surprised, present), intent (one of greeting, product_intro, product_explanation, answer, comedy, transition, promotion, cta, general_chat). Optional scene must be one of AVATAR, HUMAN, PRODUCT, SPLIT. Do not add other keys.',userPrompt:'Return a brief Indonesian greeting with emotion friendly, gesture wave, intent greeting. Do not mention products or invent facts.',temperature:0,maxTokens:120};

export class OllamaDiagnosticRunner {
  constructor(private readonly provider:AIProvider,private readonly model:string,private readonly now=()=>Date.now()){}
  async run():Promise<OllamaDiagnosticReport>{
    const started=this.now();const base={model:this.model||null,latencyMs:null,totalLatencyMs:0,checkedAt:new Date(this.now()).toISOString(),requestSucceeded:false,responseReceived:false,nonEmpty:false};
    let health;try{health=await this.provider.healthCheck()}catch{return{...base,state:'OLLAMA_UNAVAILABLE',reachable:false,modelAvailable:null,totalLatencyMs:Math.max(0,this.now()-started)}}
    if(!health.available)return{...base,state:health.message==='OLLAMA_TIMEOUT'?'TIMEOUT':'OLLAMA_UNAVAILABLE',reachable:false,modelAvailable:null,totalLatencyMs:Math.max(0,this.now()-started)};
    if(!this.model||health.modelAvailable===false)return{...base,state:'MODEL_NOT_FOUND',reachable:true,modelAvailable:false,totalLatencyMs:Math.max(0,this.now()-started)};
    let response:AIResponse;
    try{response=await this.provider.generate(request)}catch(error){const timedOut=error instanceof Error&&['TimeoutError','AbortError'].includes(error.name);const missing=error instanceof Error&&error.message==='MODEL_NOT_FOUND';return{...base,state:timedOut?'TIMEOUT':missing?'MODEL_NOT_FOUND':'REQUEST_FAILED',reachable:true,modelAvailable:!missing,totalLatencyMs:Math.max(0,this.now()-started)}}
    const latencyMs=Number.isFinite(response.latencyMs)?Math.max(0,response.latencyMs):Math.max(0,this.now()-started);
    if(!response.text.trim())return{...base,state:'EMPTY_RESPONSE',reachable:true,modelAvailable:true,requestSucceeded:true,responseReceived:true,nonEmpty:false,latencyMs,totalLatencyMs:Math.max(0,this.now()-started)};
    let parsed:unknown;try{parsed=JSON.parse(response.text)}catch{return{...base,state:'MALFORMED_RESPONSE',reachable:true,modelAvailable:true,requestSucceeded:true,responseReceived:true,nonEmpty:true,latencyMs,totalLatencyMs:Math.max(0,this.now()-started)}}
    const checked=HostResponseSchema.safeParse(parsed);if(!checked.success||!checked.data.speech.trim())return{...base,state:'MALFORMED_RESPONSE',reachable:true,modelAvailable:true,requestSucceeded:true,responseReceived:true,nonEmpty:true,latencyMs,totalLatencyMs:Math.max(0,this.now()-started)};
    return{...base,state:'READY',reachable:true,modelAvailable:true,requestSucceeded:true,responseReceived:true,nonEmpty:true,latencyMs,totalLatencyMs:Math.max(0,this.now()-started)};
  }
}
