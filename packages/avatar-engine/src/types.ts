export const AVATAR_EMOTIONS=['neutral','happy','friendly','excited','thinking','surprised','confused','sad','serious'] as const;
export const AVATAR_GESTURES=['none','wave','nod','shake_head','point_product','point_left','point_right','open_hands','thinking','celebrate'] as const;
export const AVATAR_EXPRESSIONS=['neutral','smile','big_smile','surprised','thinking','serious'] as const;
export const AVATAR_STATES=['IDLE','LISTENING','THINKING','SPEAKING','REACTING','GESTURING','MUSIC_MODE','HUMAN_TAKEOVER','STOPPED','ERROR'] as const;
export type AvatarEmotion=typeof AVATAR_EMOTIONS[number];export type AvatarGesture=typeof AVATAR_GESTURES[number];export type AvatarExpression=typeof AVATAR_EXPRESSIONS[number];export type AvatarStateName=typeof AVATAR_STATES[number];
export type AvatarCommandPriority='EMERGENCY'|'HIGH'|'NORMAL'|'LOW';export type AvatarCommandSource='host'|'personality'|'product'|'audience'|'system'|'fallback';
export interface AvatarCommand {id:string;timestamp:number;emotion?:AvatarEmotion;expression?:AvatarExpression;gesture?:AvatarGesture;intensity?:number;durationMs?:number;speechText?:string;speechStartedAt?:number;speechEndedAt?:number;priority?:AvatarCommandPriority;source:AvatarCommandSource;metadata?:Record<string,unknown>}
export interface VisemeEvent {timestampMs:number;durationMs:number;viseme:string;weight:number}
export interface AvatarRuntimeState {connected:boolean;state:AvatarStateName;emotion:AvatarEmotion;expression:AvatarExpression;gesture:AvatarGesture;queueLength:number;humanTakeover:boolean;emergencyStopped:boolean;lastError:string|null;speechPaused:boolean}
export type AvatarEngineEvent={type:'AVATAR_COMMAND';command:AvatarCommand}|{type:'AVATAR_STATE_CHANGED';state:AvatarRuntimeState}|{type:'SPEECH_STARTED'|'SPEECH_PAUSED'|'SPEECH_RESUMED'|'SPEECH_ENDED'|'MUSIC_STARTED'|'MUSIC_FINISHED'|'HUMAN_TAKEOVER'|'RETURN_TO_AI'|'EMERGENCY_STOP';timestamp:number};
export interface AvatarRuntimeAdapter {id:string;isAvailable():Promise<boolean>;connect():Promise<void>;disconnect():Promise<void>;sendCommand(command:AvatarCommand):Promise<void>;getState():Promise<AvatarRuntimeState>;emergencyStop():Promise<void>;resume?():Promise<void>}
export interface SpeechTimingProvider {getSpeechTiming(speechText:string,durationMs:number,startedAt?:number):VisemeEvent[]}
