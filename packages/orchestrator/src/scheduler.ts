import type { Scheduler } from './types.js';
export class TimeoutScheduler implements Scheduler {
  schedule(callback:()=>void,delayMs:number):ReturnType<typeof setTimeout>{return setTimeout(callback,Math.max(0,delayMs));}
  cancel(handle:unknown):void { if(handle!==undefined&&handle!==null)clearTimeout(handle as ReturnType<typeof setTimeout>); }
}
