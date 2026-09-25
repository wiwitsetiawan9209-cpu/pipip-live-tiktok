import type { AudienceIntent, AudienceSource } from '../../audience-engine/src/index.js';

export type DecisionAction='RESPOND'|'IGNORE'|'QUEUE'|'ESCALATE'|'DETERMINISTIC'|'LLM_FAST'|'LLM_STRONG'|'TOOL'|'REJECT';
export type DecisionComplexity='SIMPLE'|'MODERATE'|'COMPLEX'|'UNKNOWN';
export type JevAvailability='AVAILABLE'|'NOT_CONFIGURED'|'UNAVAILABLE'|'ERROR';
export interface DecisionRequest {
  eventType:string;source:string;text?:string|undefined;intent?:AudienceIntent|string|undefined;
  productContext?:{productId?:string|undefined;verified?:boolean|undefined}|undefined;hostState?:string|undefined;liveState?:string|undefined;musicState?:string|undefined;audienceState?:string|undefined;allowedActions?:string[]|undefined;timestamp:number;
}
export interface DecisionResult {
  decision:DecisionAction;intent:string;confidence:number;reasonCode:string;requiresLlm:boolean;requiresHuman:boolean;toolAllowed:boolean;provider:string;latencyMs?:number|undefined;metadata?:Record<string,unknown>|undefined;
}
export interface DecisionProvider {readonly id:string;isAvailable():Promise<boolean>;decide(request:DecisionRequest,signal?:AbortSignal):Promise<DecisionResult>}
export interface DecisionMetrics {decisionCount:number;jevDecisionCount:number;fallbackDecisionCount:number;deterministicCount:number;llmFastCount:number;llmStrongCount:number;ignoredEvents:number;toolRejectedCount:number;outputRejectedCount:number;escalations:number;decisionFailures:number;averageDecisionLatency:number;p95DecisionLatency:number;currentRoute:DecisionAction;currentProvider:string;currentConfidence:number;currentFallback:boolean}
export interface DecisionSnapshot {enabled:boolean;jevAvailability:JevAvailability;jevConfigured:boolean;llmFastModel:string|null;llmStrongModel:string|null;metrics:DecisionMetrics}
export type AudienceDecisionInput={intent:AudienceIntent;source:AudienceSource;text:string;product?:{id:string;name:string;price:number|null;currency:string|null;promoPrice:number|null;stock:number|null;benefits:string[];forbiddenClaims:string[]}|null;liveState:string;hostState:string;musicState:string;audienceState:string;allowedActions:string[];timestamp:number};
