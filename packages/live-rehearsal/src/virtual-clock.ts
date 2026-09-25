/** Deterministic clock shared by a rehearsal run. It never waits in wall time. */
export class VirtualClock {
  private elapsedMs=0;
  constructor(private epochMs=1_800_000_000_000){}
  now():number{return this.epochMs+this.elapsedMs}
  advance(ms:number):number{if(!Number.isFinite(ms)||ms<0)throw new RangeError('Virtual clock advance must be a finite non-negative duration');this.elapsedMs+=ms;return this.now()}
  advanceTo(epochMs:number):number{if(!Number.isFinite(epochMs)||epochMs<this.now())throw new RangeError('Virtual clock cannot move backwards');this.elapsedMs=epochMs-this.epochMs;return this.now()}
  reset(epochMs=this.epochMs):void{if(!Number.isFinite(epochMs))throw new RangeError('Virtual clock epoch must be finite');this.elapsedMs=0;this.epochMs=epochMs}
}
