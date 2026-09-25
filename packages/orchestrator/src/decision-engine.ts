import type { Product } from '../../product-engine/src/index.js';
import type { AutonomousAction, Decision, LiveSessionState } from './types.js';
export interface DecisionInput { now:number; productAvailable:boolean; product:Product|null; globalCooldown:boolean; productCooldown:boolean; backoff:boolean; }
export class DecisionEngine {
  decide(state:LiveSessionState,input:DecisionInput):Decision {
    if(!state.running||state.paused)return {action:'WAIT',reason:'session_not_autonomous'};
    if(input.backoff)return {action:'WAIT',reason:'provider_backoff'};
    if(input.globalCooldown)return {action:'WAIT',reason:'global_speech_cooldown'};
    if(!state.greeted)return {action:'GREETING',reason:'session_greeting'};
    if(state.currentProductId&&input.product){
      const sequence=this.followUpSequence(input.product);
      const action=sequence[state.nextProductStageIndex];
      if(action)return {action,reason:'product_sales_sequence',productId:input.product.id};
      return {action:'WAIT',reason:'product_sequence_complete'};
    }
    if(!input.productAvailable||input.productCooldown)return {action:'WAIT',reason:!input.productAvailable?'no_eligible_product':'product_intro_cooldown'};
    return {action:'PRODUCT_INTRO',reason:'product_opportunity'};
  }
  private followUpSequence(product:Product):AutonomousAction[]{const stages:AutonomousAction[]=[];if(product.benefits.length)stages.push('PRODUCT_BENEFIT');if(product.specifications.length)stages.push('PRODUCT_DETAIL');if(product.price!==null||product.promoPrice!==null)stages.push('PRODUCT_PRICE');stages.push('CTA');return stages;}
}
