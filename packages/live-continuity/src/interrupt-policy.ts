export type InterruptKind='COMMENT'|'FOLLOW'|'GIFT'|'NEW_VIEWER'|'URGENT_SAFETY'|'CRITICAL_SYSTEM';
export type InterruptDecision='QUEUE'|'AGGREGATE'|'INTERRUPT';
export class InterruptPolicy {decide(kind:InterruptKind,musicSegmentActive:boolean):InterruptDecision{if(kind==='URGENT_SAFETY'||kind==='CRITICAL_SYSTEM')return'INTERRUPT';if(musicSegmentActive)return kind==='FOLLOW'||kind==='NEW_VIEWER'?'AGGREGATE':'QUEUE';return kind==='FOLLOW'||kind==='NEW_VIEWER'?'AGGREGATE':'QUEUE'}}
