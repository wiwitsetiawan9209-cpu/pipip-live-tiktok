import {AIConfigSchema} from '../../protocol/src/index.js';
import type {AIConfig} from '../../shared-types/src/index.js';

export type AIEnvironment={PIPIP_MODEL?:string;OLLAMA_BASE_URL?:string;AI_MODEL?:string};

/** Environment overrides are read only in the main process and diagnostic scripts. */
export function resolveAIConfig(fileConfig:AIConfig,environment:AIEnvironment={}):AIConfig {
  const modelOverride=fileConfig.provider==='ollama'?(environment.PIPIP_MODEL??environment.AI_MODEL):(environment.AI_MODEL);
  return AIConfigSchema.parse({
    ...fileConfig,
    ...(environment.OLLAMA_BASE_URL?.trim()?{baseUrl:environment.OLLAMA_BASE_URL.trim()}:{}),
    ...(modelOverride?.trim()?{model:modelOverride.trim()}:{}),
  });
}
