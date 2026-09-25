import type { BroadcastOverlay } from './types.js';
export class OverlayQueue {
 private items:Array<{overlay:BroadcastOverlay;sequence:number}>=[];private seq=0;private paused=false;
 constructor(private readonly now=()=>Date.now(),private readonly max=32){}
 enqueue(overlay:BroadcastOverlay){this.prune();if(this.paused||this.items.some(x=>x.overlay.id===overlay.id))return false;if(this.items.length>=this.max){const lowest=this.items.reduce((a,b)=>a.overlay.priority<=b.overlay.priority?a:b);if(lowest.overlay.priority>overlay.priority)return false;this.items.splice(this.items.indexOf(lowest),1)}this.items.push({overlay:structuredClone(overlay),sequence:this.seq++});return true}
 take(){this.prune();if(this.paused)return null;this.items.sort((a,b)=>b.overlay.priority-a.overlay.priority||a.sequence-b.sequence);return this.items.shift()?.overlay??null}
 snapshot(){this.prune();return this.items.slice().sort((a,b)=>b.overlay.priority-a.overlay.priority||a.sequence-b.sequence).map(x=>structuredClone(x.overlay))}
 cancel(id:string){const before=this.items.length;this.items=this.items.filter(x=>x.overlay.id!==id);return before!==this.items.length}
 clear(){const count=this.items.length;this.items=[];return count}
 pause(){this.paused=true} resume(){this.paused=false} get depth(){this.prune();return this.items.length}
 private prune(){const now=this.now();this.items=this.items.filter(x=>x.overlay.expiresAt===null||x.overlay.expiresAt>now)}
}
