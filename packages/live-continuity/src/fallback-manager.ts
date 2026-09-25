import type {ShowAction} from './types.js';
export class FallbackManager {constructor(private readonly now=()=>Date.now()){}create(reason:string,validProductId?:string):ShowAction{return{id:`fallback-${this.now()}`,type:validProductId?'PRODUCT':'FALLBACK',priority:40,createdAt:this.now(),expiresAt:this.now()+60_000,...(validProductId?{productId:validProductId}:{}),reason}}}
