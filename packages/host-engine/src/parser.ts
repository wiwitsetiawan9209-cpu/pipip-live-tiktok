import {HostResponseSchema} from '../../protocol/src/index.js';
import type {HostResponse} from '../../shared-types/src/index.js';
import {HostEngineError} from './errors.js';

function firstJsonObject(text:string):string|null {
  const start=text.indexOf('{');if(start<0)return null;
  let depth=0,quoted=false,escaped=false;
  for(let i=start;i<text.length;i++){
    const c=text[i]!;
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"'){quoted=true;continue;}if(c==='{')depth++;if(c==='}'&&--depth===0)return text.slice(start,i+1);
  }
  return null;
}
export function parseHostResponseWithDiagnostics(raw:string):{response:HostResponse;normalizations:string[]} {
  const rawCandidate=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const json=firstJsonObject(rawCandidate);
  if(!json)throw new HostEngineError('INVALID_AI_RESPONSE');
  let value:unknown;try{value=JSON.parse(json)}catch{throw new HostEngineError('INVALID_AI_RESPONSE')}
  let candidate=value;let parsed=HostResponseSchema.safeParse(candidate);const normalizations:string[]=[];
  if(!parsed.success){
    const gestureOnly=parsed.error.issues.length>0&&parsed.error.issues.every(issue=>issue.path.length===1&&issue.path[0]==='gesture'&&['invalid_value','invalid_enum_value'].includes(issue.code));
    if(gestureOnly&&candidate!==null&&typeof candidate==='object'&&!Array.isArray(candidate)&&typeof (candidate as Record<string,unknown>).gesture==='string'){
      candidate={...(candidate as Record<string,unknown>),gesture:'talking'};parsed=HostResponseSchema.safeParse(candidate);
      if(parsed.success)normalizations.push('INVALID_GESTURE_DEFAULTED_TO_TALKING');
    }
  }
  if(!parsed.success)throw new HostEngineError('INVALID_AI_RESPONSE',`INVALID AI RESPONSE: ${parsed.error.issues.map(issue=>`${issue.path.join('.')||'response'}:${issue.code}`).join(', ')}`);
  const speech=parsed.data.speech.replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)]+\)/g,'$1').replace(/<[^>]*>/g,'').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g,' ').replace(/[\*_~`#>]/g,'').replace(/\s+/g,' ').trim();
  if(!speech)throw new HostEngineError('INVALID_AI_RESPONSE');
  const safe={...parsed.data,speech};const rechecked=HostResponseSchema.safeParse(safe);if(!rechecked.success)throw new HostEngineError('INVALID_AI_RESPONSE');return{response:rechecked.data,normalizations};
}
export function parseHostResponse(raw:string):HostResponse{return parseHostResponseWithDiagnostics(raw).response}
