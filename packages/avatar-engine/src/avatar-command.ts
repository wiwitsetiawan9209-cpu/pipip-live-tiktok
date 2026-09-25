import {AVATAR_EMOTIONS,AVATAR_EXPRESSIONS,AVATAR_GESTURES,type AvatarCommand,type AvatarCommandPriority,type AvatarCommandSource} from './types.js';
export function createAvatarCommand(input:Partial<AvatarCommand>&Pick<AvatarCommand,'source'>,now=Date.now()):AvatarCommand {
  if(input.id!==undefined&&(typeof input.id!=='string'||input.id.length<1||input.id.length>100))throw new Error('Invalid avatar command id');
  if(input.emotion!==undefined&&!AVATAR_EMOTIONS.includes(input.emotion))throw new Error('Invalid avatar emotion');
  if(input.expression!==undefined&&!AVATAR_EXPRESSIONS.includes(input.expression))throw new Error('Invalid avatar expression');
  if(input.gesture!==undefined&&!AVATAR_GESTURES.includes(input.gesture))throw new Error('Invalid avatar gesture');
  if(!['host','personality','product','audience','system','fallback'].includes(input.source))throw new Error('Invalid avatar command source');
  if(input.priority!==undefined&&!['EMERGENCY','HIGH','NORMAL','LOW'].includes(input.priority))throw new Error('Invalid avatar priority');
  const intensity=input.intensity??0.5,durationMs=input.durationMs??3000,timestamp=input.timestamp??now;
  if(!Number.isFinite(intensity)||intensity<0||intensity>1||!Number.isInteger(durationMs)||durationMs<0||durationMs>120000||!Number.isFinite(timestamp))throw new Error('Invalid avatar command timing or intensity');
  if(input.speechText!==undefined&&input.speechText.length>4000)throw new Error('Avatar speech text is too long');
  return {id:input.id??crypto.randomUUID(),timestamp,...(input.emotion?{emotion:input.emotion}:{}),...(input.expression?{expression:input.expression}:{}),...(input.gesture?{gesture:input.gesture}:{}),intensity,durationMs,...(input.speechText!==undefined?{speechText:input.speechText}:{}),...(input.speechStartedAt!==undefined?{speechStartedAt:input.speechStartedAt}:{}),...(input.speechEndedAt!==undefined?{speechEndedAt:input.speechEndedAt}:{}),priority:input.priority??'NORMAL',source:input.source as AvatarCommandSource,...(input.metadata?{metadata:structuredClone(input.metadata)}:{})};
}
export function commandFingerprint(command:AvatarCommand){return [command.emotion??'',command.expression??'',command.gesture??'',command.speechText??'',command.source].join('|').toLocaleLowerCase('en-US')}
export function priorityRank(priority:AvatarCommandPriority){return ({EMERGENCY:0,HIGH:1,NORMAL:2,LOW:3})[priority]}
