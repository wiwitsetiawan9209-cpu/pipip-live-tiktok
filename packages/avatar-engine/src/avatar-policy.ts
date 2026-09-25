import type {AvatarCommand} from './types.js';
export class AvatarPolicy {allow(command:AvatarCommand,state:{humanTakeover:boolean;emergencyStopped:boolean}){if(state.emergencyStopped)return command.priority==='EMERGENCY'&&command.source==='system';if(state.humanTakeover)return command.source==='system'&&command.gesture==='none'&&command.expression==='neutral';return true}}
