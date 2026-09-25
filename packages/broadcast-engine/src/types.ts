import type { Product } from '../../product-engine/src/index.js';

export type BroadcastStatus='IDLE'|'PREPARING'|'LIVE'|'PAUSED'|'HUMAN_TAKEOVER'|'EMERGENCY_STOPPED'|'STOPPING'|'STOPPED'|'ERROR';
export type SceneId='DEFAULT'|'PRODUCT'|'PRODUCT_FOCUS'|'HOST_SPEAKING'|'MUSIC'|'WAITING'|'HUMAN_TAKEOVER'|'EMERGENCY'|'ERROR';
export type OverlayType='PRODUCT'|'PRICE'|'PROMOTION'|'CTA'|'HOST_STATUS'|'ACTIVITY'|'MUSIC'|'SYSTEM'|'AUDIENCE_EVENT'|'ERROR'|'EMERGENCY';
export type HostVisualState='IDLE'|'THINKING'|'SPEAKING'|'LISTENING'|'WAITING'|'MUSIC_MODE'|'HUMAN_TAKEOVER'|'ERROR'|'STOPPED';
export type MusicVisualState='STOPPED'|'BACKGROUND'|'PLAYING'|'PAUSED'|'DUCKED'|'FADING'|'FINISHED'|'ERROR'|'UNKNOWN';
export interface BroadcastOverlay {id:string;type:OverlayType;priority:number;visible:boolean;createdAt:number;expiresAt:number|null;data:Record<string,string|number|boolean|null|string[]>;source:string;dismissible:boolean}
export interface SceneState {sceneId:SceneId;name:string;active:boolean;priority:number;startedAt:number;durationMs:number|null;overlays:string[];metadata:Record<string,string|number|boolean|null>}
export interface ProductVisual {id:string;name:string;category:string|null;price:number|null;currency:string|null;formattedPrice:string|null;promoPrice:number|null;formattedPromoPrice:string|null;description:string|null;benefits:string[];specifications:string[];variants:string[];stock:number|null;stockState:'IN_STOCK'|'LOW_STOCK'|'OUT_OF_STOCK'|'UNKNOWN';images:string[];sellingPoints:string[];targetAudience:string[]}
export interface BroadcastRenderState {status:BroadcastStatus;scene:SceneState;overlays:BroadcastOverlay[];product:ProductVisual|null;host:{state:HostVisualState;detail:string|null};music:{state:MusicVisualState;title:string|null;artist:string|null;progressMs:number|null;durationMs:number|null;volume:number|null;ducked:boolean|null};activity:string|null;audience:{available:boolean;event:string|null};avatar:{state:string|null;emotion:string|null;expression:string|null;gesture:string|null};emergency:boolean;humanTakeover:boolean;timestamp:number}
export interface BroadcastOutputState {connected:boolean;available:boolean;error:string|null;lastRenderAt:number|null}
export interface BroadcastOutputAdapter {id:string;isAvailable():Promise<boolean>;connect():Promise<void>;disconnect():Promise<void>;render(state:BroadcastRenderState):Promise<void>;clear():Promise<void>;getState():Promise<BroadcastOutputState>;emergencyStop():Promise<void>}
export interface BroadcastHealth {status:'healthy'|'degraded'|'error'|'unknown';output:'connected'|'disconnected'|'error'|'unknown';scene:string;overlayCount:number;queueDepth:number;renderCount:number;renderFailures:number;lastRenderAt:number|null;timestamp:number}
export interface BroadcastDiagnostics {sceneChanges:number;overlaysCreated:number;overlaysDismissed:number;productRenders:number;ctaRenders:number;musicRenders:number;hostRenders:number;renderFailures:number;outputConnectionFailures:number;emergencyStops:number}
export interface BroadcastOptions {now?:()=>number;maxOverlays?:number;maxQueue?:number;defaultOverlayTtlMs?:number}
export type BroadcastCommand='startPreview'|'stopPreview'|'refresh'|'clearOverlays'|'testProduct'|'testCTA'|'testMusic'|'testHost'|'testHumanTakeover'|'testEmergency'|'reset';
export interface BroadcastStatusSnapshot {state:BroadcastStatus;render:BroadcastRenderState;health:BroadcastHealth;output:BroadcastOutputState;queueDepth:number;diagnostics:BroadcastDiagnostics;watchdogFindings:import('./broadcast-watchdog.js').BroadcastFinding[]}
export type ProductSource=(id:string)=>Product|null;
