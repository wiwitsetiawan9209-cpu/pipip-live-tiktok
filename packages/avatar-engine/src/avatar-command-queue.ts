import {commandFingerprint,priorityRank} from './avatar-command.js';
import type {AvatarCommand} from './types.js';
interface Entry {command:AvatarCommand;sequence:number}
export class AvatarCommandQueue {
 private entries:Entry[]=[];private sequence=0;private stopped=false;
 constructor(private readonly maxSize=32,private readonly now=()=>Date.now()){if(!Number.isInteger(maxSize)||maxSize<1||maxSize>256)throw new Error('Avatar queue size must be 1 to 256')}
 get size(){this.prune();return this.entries.length}
 enqueue(command:AvatarCommand){this.prune();if(this.stopped||command.timestamp+command.durationMs!<this.now()||this.entries.some(e=>e.command.id===command.id||commandFingerprint(e.command)===commandFingerprint(command))||this.entries.length>=this.maxSize)return false;this.entries.push({command:structuredClone(command),sequence:this.sequence++});return true}
 takeNext(){this.prune();if(this.stopped)return undefined;this.entries.sort((a,b)=>priorityRank(a.command.priority!)-priorityRank(b.command.priority!)||a.sequence-b.sequence);return this.entries.shift()?.command}
 cancel(id:string){const before=this.entries.length;this.entries=this.entries.filter(e=>e.command.id!==id);return before!==this.entries.length}
 clear(){this.entries=[];this.stopped=false}
 emergencyClear(){this.entries=[];this.stopped=true}
 resume(){this.stopped=false}
 list(){this.prune();return this.entries.map(e=>structuredClone(e.command))}
 private prune(){const now=this.now();this.entries=this.entries.filter(e=>e.command.timestamp+e.command.durationMs!>=now)}
}
