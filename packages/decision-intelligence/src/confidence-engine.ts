export type ConfidenceBand='ACCEPT'|'VALIDATE'|'ESCALATE'|'INVALID';
export function confidenceBand(value:number):ConfidenceBand {if(!Number.isFinite(value)||value<0||value>1)return'INVALID';if(value>=0.9)return'ACCEPT';if(value>=0.7)return'VALIDATE';return'ESCALATE'}
