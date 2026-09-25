import type {AudienceIntent} from '../../audience-engine/src/index.js';
import type {DecisionRequest,DecisionResult} from './types.js';
import {confidenceBand} from './confidence-engine.js';

export function estimateComplexity(text=''): 'SIMPLE'|'MODERATE'|'COMPLEX'|'UNKNOWN' {
  const words=text.trim().split(/\s+/u).filter(Boolean).length;if(!words)return'UNKNOWN';
  const clauses=(text.match(/[?!.;]/gu)?.length??0);const compare=/\b(bandingkan|perbandingan|compare|versus|vs)\b/iu.test(text);const constraints=/\b(dengan syarat|sementara|namun|tetapi|kalau|jika|dan juga)\b/iu.test(text);
  return compare||words>24||clauses>2||constraints&&words>12?'COMPLEX':words>10||clauses>1||constraints||clauses===1&&words>=5?'MODERATE':'SIMPLE';
}
const result=(decision:DecisionResult['decision'],intent:string,reasonCode:string,requiresLlm=false,requiresHuman=false,metadata?:Record<string,unknown>):DecisionResult=>({decision,intent,confidence:1,reasonCode,requiresLlm,requiresHuman,toolAllowed:false,provider:'deterministic',...(metadata?{metadata}:{})});
export function deterministicRule(request:DecisionRequest):DecisionResult|null {
  const intent=request.intent??'UNKNOWN';
  if(request.eventType==='EMERGENCY_STOP')return result('DETERMINISTIC','SYSTEM','EMERGENCY_PRIORITY');
  if(request.eventType==='HUMAN_TAKEOVER')return result('DETERMINISTIC','SYSTEM','HUMAN_TAKEOVER_PRIORITY',false,true);
  if(request.eventType==='STOP')return result('DETERMINISTIC','SYSTEM','STOP_PRIORITY');
  if(request.liveState==='EMERGENCY_STOPPED')return result('REJECT','SYSTEM','EMERGENCY_LATCHED',false,true);
  if(request.liveState==='HUMAN_TAKEOVER'||request.hostState==='HUMAN_TAKEOVER')return result('QUEUE','SYSTEM','HUMAN_TAKEOVER_ACTIVE',false,true);
  if(intent==='SPAM'||intent==='ABUSE'||intent==='OFF_TOPIC')return result('IGNORE',intent,'UNSAFE_OR_IRRELEVANT_INTENT');
  if(intent==='PRICE_QUESTION'||intent==='STOCK_QUESTION')return result('DETERMINISTIC',intent,request.productContext?.verified&&request.productContext.productId?'VERIFIED_PRODUCT_FACT':'PRODUCT_FACT_LOOKUP');
  if(intent==='REACTION')return result('IGNORE',intent,'LOW_VALUE_REACTION');
  if(intent==='COMPLAINT')return result('ESCALATE',intent,'COMPLAINT_REQUIRES_REVIEW',false,true);
  if(intent==='PURCHASE_INTENT')return result('LLM_FAST',intent,'PURCHASE_INTENT_RESPONSE',true);
  if(intent==='GREETING'||intent==='JOKE')return result('LLM_FAST',intent,'LOW_COMPLEXITY_RESPONSE',true);
  if(intent==='COMPARISON')return result('LLM_STRONG',intent,'COMPARISON_REQUIRES_REASONING',true);
  if(intent==='PRODUCT_RECOMMENDATION')return result(estimateComplexity(request.text)==='COMPLEX'?'LLM_STRONG':'LLM_FAST',intent,'PRODUCT_RECOMMENDATION',true);
  if(intent==='UNKNOWN')return null;
  if(intent==='GENERAL_QUESTION'||intent==='PRODUCT_QUESTION'||intent==='VARIANT_QUESTION'||intent==='REQUEST_DEMO')return result(estimateComplexity(request.text)==='COMPLEX'?'LLM_STRONG':'LLM_FAST',intent,'NORMALIZED_AUDIENCE_INTENT',true);
  return null;
}
export function applyConfidence(result:DecisionResult):DecisionResult {
  const band=confidenceBand(result.confidence);if(band==='INVALID')return{...result,decision:'REJECT',requiresLlm:false,requiresHuman:true,toolAllowed:false,reasonCode:'INVALID_CONFIDENCE'};
  if(band==='ESCALATE')return{...result,decision:'ESCALATE',requiresLlm:false,requiresHuman:true,toolAllowed:false,reasonCode:'LOW_CONFIDENCE'};
  if(band==='VALIDATE')return{...result,decision:'QUEUE',requiresLlm:false,requiresHuman:true,toolAllowed:false,reasonCode:'CONFIDENCE_REQUIRES_VALIDATION'};
  return result;
}
export function verifiedProductAnswer(intent:AudienceIntent,product:{name:string;price:number|null;currency:string|null;promoPrice:number|null;stock:number|null}):string|null {
  if(intent==='PRICE_QUESTION'){
    if(product.price===null)return`Maaf, harga ${product.name} belum tersedia di katalog terverifikasi.`;
    const regular=formatProductPrice(product.price,product.currency);
    return product.promoPrice!==null?`Harga katalog ${product.name} ${regular}, dan harga promo terverifikasi ${formatProductPrice(product.promoPrice,product.currency)}.`:`Harga katalog ${product.name} ${regular}.`;
  }
  if(intent==='STOCK_QUESTION')return product.stock===null?`Maaf, informasi stok ${product.name} belum tersedia di katalog terverifikasi.`:product.stock===0?`Produk ${product.name} tercatat habis pada katalog.`:`Stok ${product.name} tercatat ${product.stock} unit di katalog.`;
  return null;
}
function formatProductPrice(value:number,currency:string|null){try{return new Intl.NumberFormat('id-ID',{style:'currency',currency:currency??'IDR',maximumFractionDigits:0}).format(value)}catch{return`${currency??''} ${new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(value)}`.trim()}}
