import type {AvatarCommand} from './types.js';
export interface SemanticAnimation {emotion:string;expression:string;gesture:string;durationMs:number;intensity:number}
export function toSemanticAnimation(command:AvatarCommand):SemanticAnimation{return{emotion:command.emotion??'neutral',expression:command.expression??'neutral',gesture:command.gesture??'none',durationMs:command.durationMs??0,intensity:command.intensity??0}}
