export type CooldownKind='speech'|'product'|'backoff';
export class Cooldown {
  constructor(private readonly now:()=>number=()=>Date.now()){}
  remaining(until:number|null):number { return until===null?0:Math.max(0,until-this.now()); }
  active(until:number|null):boolean { return this.remaining(until)>0; }
  expiresAt(lastAt:number|null,durationMs:number):number|null { return lastAt===null?null:lastAt+durationMs; }
}
