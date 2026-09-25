import type {DecisionAction} from './types.js';
export type LLMRoute='LLM_FAST'|'LLM_STRONG';
export class LLMRouter {
  constructor(private readonly configuredModel:string|null,private readonly provider:'ollama'|'openai-compatible'='ollama'){}
  resolve(route:DecisionAction):{route:LLMRoute;provider:'ollama'|'openai-compatible';model:string|null}|null{if(route!=='LLM_FAST'&&route!=='LLM_STRONG')return null;return{route,provider:this.provider,model:this.configuredModel}}
  snapshot(){return{fastModel:this.configuredModel,strongModel:this.configuredModel}}
}
