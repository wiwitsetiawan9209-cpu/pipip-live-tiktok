import {deterministicRule} from '../decision-policy.js';
import type {DecisionProvider,DecisionRequest,DecisionResult} from '../types.js';
export class DeterministicDecisionProvider implements DecisionProvider {
  readonly id='deterministic';
  async isAvailable(){return true}
  async decide(request:DecisionRequest):Promise<DecisionResult>{return deterministicRule(request)??{decision:'LLM_STRONG',intent:request.intent??'UNKNOWN',confidence:1,reasonCode:'UNKNOWN_TO_EXISTING_LLM',requiresLlm:true,requiresHuman:false,toolAllowed:false,provider:this.id}}
}
