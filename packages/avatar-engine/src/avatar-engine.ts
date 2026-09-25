import type {HostResponse,HostTrigger} from '../../shared-types/src/index.js';
import {createAvatarCommand} from './avatar-command.js';
import {AvatarCommandQueue} from './avatar-command-queue.js';
import {EmotionEngine} from './emotion-engine.js';
import {ExpressionEngine} from './expression-engine.js';
import {GestureEngine} from './gesture-engine.js';
import {assertAvatarTransition,initialAvatarState} from './avatar-state.js';
import {AvatarPolicy} from './avatar-policy.js';
import type {AvatarCommand,AvatarEngineEvent,AvatarExpression,AvatarGesture,AvatarRuntimeAdapter,AvatarRuntimeState} from './types.js';
export interface AvatarEngineOptions {now?:()=>number;queueSize?:number;gestureCooldownMs?:number;emit?:(event:AvatarEngineEvent)=>void}
export class AvatarEngine {
 private state:AvatarRuntimeState=initialAvatarState();private queue:AvatarCommandQueue;private now:()=>number;private listeners=new Set<(event:AvatarEngineEvent)=>void>();private draining=false;private emotion=new EmotionEngine();private expression=new ExpressionEngine();private gesture:GestureEngine;private policy=new AvatarPolicy();
 constructor(private readonly runtime:AvatarRuntimeAdapter,options:AvatarEngineOptions={}){this.now=options.now??Date.now;this.queue=new AvatarCommandQueue(options.queueSize??32,this.now);this.gesture=new GestureEngine(options.gestureCooldownMs??3000,this.now);if(options.emit)this.listeners.add(options.emit)}
 onEvent(listener:(event:AvatarEngineEvent)=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener)}
 private emit(event:AvatarEngineEvent){for(const listener of this.listeners)listener(structuredClone(event))}
 private publish(){this.state.queueLength=this.queue.size;void this.runtime.getState().then(r=>{this.state.connected=r.connected;this.emit({type:'AVATAR_STATE_CHANGED',state:this.snapshot()})}).catch(()=>this.emit({type:'AVATAR_STATE_CHANGED',state:this.snapshot()}))}
 snapshot(){return structuredClone({...this.state,queueLength:this.queue.size})}
 async connect(){if(this.state.emergencyStopped)throw new Error('Avatar engine is emergency-stopped');try{if(!(await this.runtime.isAvailable()))throw new Error('Avatar runtime unavailable');await this.runtime.connect();this.state.connected=true;this.transition('IDLE');this.publish()}catch(e){this.fail(e);throw e}}
 async disconnect(){await this.runtime.disconnect();this.state.connected=false;this.state.gesture='none';if(!this.state.emergencyStopped)this.transition(this.state.humanTakeover?'HUMAN_TAKEOVER':'IDLE');this.publish()}
 async handleHostResponse(response:HostResponse,trigger:HostTrigger,personalityId='default-personality'){if(!this.allowed())return false;const mapping=this.emotion.map(response,personalityId);const gesture=this.gesture.select(response,trigger,personalityId);const source=trigger==='COMMENT'?'audience':trigger==='PRODUCT_INTRO'||trigger==='PRODUCT_DEMO'||trigger==='PROMOTION'?'product':'host';const command=createAvatarCommand({source,priority:'NORMAL',emotion:mapping.emotion,expression:this.expression.normalize(mapping.expression),gesture,intensity:mapping.intensity,durationMs:3000,speechText:response.speech},this.now());return this.submit(command,'REACTING')}
 async submit(command:AvatarCommand,state:'GESTURING'|'REACTING'='GESTURING'){if(!this.policy.allow(command,this.state)||!this.runtimeReady())return false;if(!this.queue.enqueue(command)){this.publish();return false}this.state.queueLength=this.queue.size;this.publish();await this.drain(state);return true}
 async testCommand(command:Pick<AvatarCommand,'emotion'|'expression'|'gesture'>){const value=createAvatarCommand({source:'system',priority:'NORMAL',...command},this.now());return this.submit(value,'GESTURING')}
 async speechStarted(text:string){if(this.state.humanTakeover||this.state.emergencyStopped)return;this.state.speechPaused=false;this.transition('SPEAKING');this.emit({type:'SPEECH_STARTED',timestamp:this.now()});this.publish()}
 speechPaused(){if(!this.state.humanTakeover&&!this.state.emergencyStopped){this.state.speechPaused=true;this.emit({type:'SPEECH_PAUSED',timestamp:this.now()});this.publish()}}
 speechResumed(){if(!this.state.humanTakeover&&!this.state.emergencyStopped){this.state.speechPaused=false;this.transition('SPEAKING');this.emit({type:'SPEECH_RESUMED',timestamp:this.now()});this.publish()}}
 speechEnded(failed=false){if(this.state.humanTakeover||this.state.emergencyStopped)return;this.state.speechPaused=false;if(failed){this.transition('ERROR');this.state.lastError='Speech playback failed';this.transition('IDLE')}else this.transition(this.state.connected?'IDLE':'STOPPED');this.emit({type:'SPEECH_ENDED',timestamp:this.now()});this.publish()}
 thinking(){if(this.allowed())this.transition('THINKING')}
 musicStarted(fullSong=true){if(fullSong&&!this.state.humanTakeover&&!this.state.emergencyStopped){this.transition('MUSIC_MODE');this.emit({type:'MUSIC_STARTED',timestamp:this.now()});this.publish()}}
 musicFinished(){if(this.state.state==='MUSIC_MODE'){this.transition('IDLE');this.emit({type:'MUSIC_FINISHED',timestamp:this.now()});this.publish()}}
 humanTakeover(active:boolean){if(active){if(this.state.emergencyStopped)return;this.queue.clear();this.state.humanTakeover=true;this.state.emotion='neutral';this.state.expression='neutral';this.state.gesture='none';this.state.speechPaused=false;this.transition('HUMAN_TAKEOVER');const safe=createAvatarCommand({source:'system',priority:'HIGH',emotion:'neutral',expression:'neutral',gesture:'none'},this.now());void this.runtime.sendCommand(safe).catch(()=>undefined);this.emit({type:'HUMAN_TAKEOVER',timestamp:this.now()})}else if(this.state.humanTakeover){this.state.humanTakeover=false;this.state.emotion='neutral';this.state.expression='neutral';this.state.gesture='none';this.transition('IDLE');this.emit({type:'RETURN_TO_AI',timestamp:this.now()})}this.publish()}
 async emergencyStop(){this.queue.emergencyClear();this.state.emergencyStopped=true;this.state.humanTakeover=false;this.state.emotion='neutral';this.state.expression='neutral';this.state.gesture='none';this.state.speechPaused=false;this.transition('STOPPED');await this.runtime.emergencyStop();this.emit({type:'EMERGENCY_STOP',timestamp:this.now()});this.publish()}
 async resume(){if(!this.state.emergencyStopped)return false;this.queue.resume();await this.runtime.resume?.();this.state.emergencyStopped=false;this.state.lastError=null;this.state.gesture='none';this.transition(this.state.connected?'IDLE':'STOPPED');this.publish();return true}
 clear(){this.queue.clear();this.publish()}
 cancel(id:string){const result=this.queue.cancel(id);this.publish();return result}
 getRuntime(){return this.runtime}
 private allowed(){return !this.state.humanTakeover&&!this.state.emergencyStopped}
 private runtimeReady(){return this.state.connected&&!this.state.emergencyStopped&&this.runtime.id.length>0}
 private async drain(state:'GESTURING'|'REACTING'){if(this.draining)return;this.draining=true;try{let command=this.queue.takeNext();while(command){if(!this.policy.allow(command,this.state))continue;this.transition(state);await this.runtime.sendCommand(command);if(command.emotion)this.state.emotion=command.emotion;if(command.expression)this.state.expression=command.expression;if(command.gesture)this.state.gesture=command.gesture;this.emit({type:'AVATAR_COMMAND',command});this.transition(command.speechText?'REACTING':'IDLE');command=this.queue.takeNext()}}catch(e){this.fail(e)}finally{this.draining=false;this.publish()}}
 private transition(next:AvatarRuntimeState['state']){assertAvatarTransition(this.state.state,next);this.state.state=next;this.emit({type:'AVATAR_STATE_CHANGED',state:this.snapshot()})}
 private fail(error:unknown){this.state.lastError=error instanceof Error?error.message.slice(0,200):'Avatar runtime failure';this.state.gesture='none';this.transition('ERROR');this.publish()}
}
