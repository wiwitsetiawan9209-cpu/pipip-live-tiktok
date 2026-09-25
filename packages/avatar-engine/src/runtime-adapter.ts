import {AVATAR_EMOTIONS,AVATAR_EXPRESSIONS,AVATAR_GESTURES,type AvatarCommand,type AvatarRuntimeAdapter,type AvatarRuntimeState} from './types.js';
import {initialAvatarState} from './avatar-state.js';
export function validateRuntimeCommand(value:AvatarCommand):AvatarCommand{if(!value||typeof value!=='object'||Object.keys(value).some(key=>!['id','timestamp','emotion','expression','gesture','intensity','durationMs','speechText','speechStartedAt','speechEndedAt','priority','source','metadata'].includes(key))||typeof value.id!=='string'||value.id.length<1||value.id.length>100||!Number.isFinite(value.timestamp)||!['host','personality','product','audience','system','fallback'].includes(value.source))throw new Error('Invalid runtime command');if(value.emotion&&!AVATAR_EMOTIONS.includes(value.emotion)||value.expression&&!AVATAR_EXPRESSIONS.includes(value.expression)||value.gesture&&!AVATAR_GESTURES.includes(value.gesture))throw new Error('Invalid semantic avatar value');if(value.intensity!==undefined&&(!Number.isFinite(value.intensity)||value.intensity<0||value.intensity>1))throw new Error('Invalid runtime intensity');if(value.durationMs!==undefined&&(!Number.isInteger(value.durationMs)||value.durationMs<0||value.durationMs>120000))throw new Error('Invalid runtime duration');if(value.speechText!==undefined&&(typeof value.speechText!=='string'||value.speechText.length>4000))throw new Error('Invalid runtime speech');return structuredClone(value)}
export class MockAvatarRuntimeAdapter implements AvatarRuntimeAdapter {
 readonly id='mock';private state=initialAvatarState();private available=true;private failure:Error|null=null;
 async isAvailable(){return this.available}
 async connect(){if(!this.available)throw new Error('Mock avatar runtime unavailable');this.state={...this.state,connected:true,state:'IDLE',lastError:null}}
 async disconnect(){this.state={...this.state,connected:false,state:this.state.emergencyStopped?'STOPPED':'IDLE',gesture:'none'}}
 async sendCommand(command:AvatarCommand){if(this.failure)throw this.failure;if(!this.available||!this.state.connected||this.state.emergencyStopped)throw new Error('Avatar runtime is not ready');const safe=validateRuntimeCommand(command);this.state={...this.state,...(safe.emotion?{emotion:safe.emotion}:{}),...(safe.expression?{expression:safe.expression}:{}),...(safe.gesture?{gesture:safe.gesture}:{})}}
 async getState(){return structuredClone(this.state)}
 async emergencyStop(){this.state={...this.state,state:'STOPPED',gesture:'none',emotion:'neutral',expression:'neutral',emergencyStopped:true,speechPaused:false}}
 async resume(){this.state={...this.state,state:'IDLE',gesture:'none',emergencyStopped:false,lastError:null}}
 setAvailable(value:boolean){this.available=value}
 failWith(error:Error|null){this.failure=error}
 setState(state:Partial<AvatarRuntimeState>){this.state={...this.state,...state}}
}
