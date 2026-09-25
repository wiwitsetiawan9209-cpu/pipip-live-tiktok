import type {AIHealthStatus,AIRequest,AIResponse} from '../../shared-types/src/index.js';
export interface AIProvider {getName():string;healthCheck():Promise<AIHealthStatus>;generate(request:AIRequest):Promise<AIResponse>}
export {OllamaProvider,OpenAICompatibleProvider} from './providers.js';
export {resolveAIConfig} from './config.js';
export {OllamaDiagnosticRunner,type OllamaDiagnosticReport,type OllamaDiagnosticState} from './ollama-diagnostic.js';
