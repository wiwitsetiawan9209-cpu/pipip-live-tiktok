import {readFileSync} from 'node:fs';
import path from 'node:path';
import {OllamaDiagnosticRunner,OllamaProvider,resolveAIConfig} from '../packages/ai-core/src/index.js';
import {AIConfigSchema} from '../packages/protocol/src/index.js';

const projectRoot=process.cwd();
const fileConfig=AIConfigSchema.parse(JSON.parse(readFileSync(path.join(projectRoot,'config/ai.json'),'utf8')) as unknown);
const config=resolveAIConfig(fileConfig,process.env);
if(config.provider!=='ollama'){process.stdout.write(`${JSON.stringify({state:'OLLAMA_UNAVAILABLE',reason:'OLLAMA_NOT_SELECTED',model:config.model||null})}\n`);process.exitCode=2}
else{
  const endpoint=new URL(config.baseUrl);
  if(endpoint.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)){process.stdout.write(`${JSON.stringify({state:'OLLAMA_UNAVAILABLE',reason:'LOCAL_ENDPOINT_REQUIRED',model:config.model||null})}\n`);process.exitCode=2}
  else{const provider=new OllamaProvider(config.baseUrl,config.model,fetch,12_000);const report=await new OllamaDiagnosticRunner(provider,config.model).run();process.stdout.write(`${JSON.stringify(report)}\n`);if(report.state!=='READY')process.exitCode=1}
}
