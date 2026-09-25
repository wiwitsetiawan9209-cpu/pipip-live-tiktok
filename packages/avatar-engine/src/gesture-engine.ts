import type {HostResponse,HostTrigger} from '../../shared-types/src/index.js';
import type {AvatarGesture} from './types.js';
export class GestureEngine {
 private lastGesture:AvatarGesture='none';private lastAt=-Infinity;
 constructor(private readonly cooldownMs=3000,private readonly now=()=>Date.now()){if(!Number.isInteger(cooldownMs)||cooldownMs<2000||cooldownMs>5000)throw new Error('Gesture cooldown must be between 2 and 5 seconds')}
 select(response:HostResponse,_trigger:HostTrigger,personalityId='default-personality'):AvatarGesture{let gesture:AvatarGesture='none';if(response.intent==='greeting'||response.gesture==='wave')gesture='wave';else if(response.intent==='product_intro'||response.intent==='product_explanation'||response.gesture==='point_product')gesture='point_product';else if(response.intent==='promotion')gesture='open_hands';else if(response.gesture==='think')gesture='thinking';else if(response.gesture==='surprised')gesture='open_hands';else if(response.gesture==='laugh'||response.intent==='comedy')gesture=personalityId==='energetic'?'celebrate':'nod';else if(response.gesture==='present')gesture='open_hands';else if(response.gesture==='point_human')gesture='none';else if(response.intent==='answer')gesture='nod';if(gesture==='none')return gesture;const now=this.now();if(gesture===this.lastGesture&&now-this.lastAt<this.cooldownMs)return'none';this.lastGesture=gesture;this.lastAt=now;return gesture}
 reset(){this.lastGesture='none';this.lastAt=-Infinity}
}
