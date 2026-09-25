import type { AutonomousAction } from '../../shared-types/src/index.js';
import type { HostContext } from '../../shared-types/src/index.js';
export type { AutonomousAction, OrchestratorEvent } from '../../shared-types/src/index.js';

export type AudienceState = {kind:'UNKNOWN'}|{kind:'KNOWN';audienceCount:number;intent?:string};
export type HumanPresenceState = 'NO_HUMAN'|'HUMAN_ENTERING'|'HUMAN_PRESENT'|'HUMAN_LEAVING'|'MULTIPLE_HUMANS'|'UNKNOWN';
export interface LiveSessionState {
  sessionId: number|string; running:boolean; paused:boolean; startedAt:number; lastActionAt:number|null; lastSpeechAt:number|null;
  lastProductId:string|null; currentProductId:string|null; productsDiscussed:string[]; lastProductIntroAt:number|null;
  currentIntent:AutonomousAction|null; currentProductStage:'INTRO'|'FOLLOW_UP'|null; nextProductStageIndex:number;
  productMentions:Array<{productId:string;at:number}>; greeted:boolean; hostState:'IDLE'|'THINKING'|'SPEAKING'|'ERROR'|'PAUSED'; humanPresence:HumanPresenceState; audience:AudienceState; failureCount:number; retryAfter:number|null;
}
export type Decision={action:AutonomousAction;reason:string;productId?:string};
export interface Scheduler { schedule(callback:()=>void,delayMs:number):unknown; cancel(handle:unknown):void; }
export interface CooldownConfig {tickMs:number;globalSpeechMs:number;productIntroMs:number;repeatedProductMs:number;backoffMs:number;backoffMaxMs:number;}
export interface AudienceStateProvider { getState():AudienceState; }
export interface HumanPresenceProvider { getState():HumanPresenceState; }
export interface ShowRuntimeInput {now:number;sessionId:number|string;sessionStartedAt:number;sessionDurationMs:number;lastHostSpeechAt:number|null;lastAudienceEventAt:number|null;greeted:boolean;pendingAudience:number;availableProductIds:string[];currentTopic:string|null;personality:string;paused:boolean;humanTakeover:boolean;stopped:boolean}
export interface ShowRuntimePlan {token:string;action:'MUSIC_INTRO'|'AFTER_SONG'|'SHOW_TRANSITION';context?:NonNullable<HostContext['musicContext']>;showContext?:NonNullable<HostContext['showContext']>;instruction:string}
export interface ShowRuntimePort {advance(input:ShowRuntimeInput):Promise<{kind:'MUSIC_PLAYING'}|{kind:'HOST';plan:ShowRuntimePlan}|{kind:'NONE'}>;complete(plan:ShowRuntimePlan,success:boolean):Promise<void>|void;start(sessionStartedAt:number):void;pause():void;resume():void;stop():void;nextWakeDelay(now:number):number|null;speechStarted():void;speechFinished():void}
