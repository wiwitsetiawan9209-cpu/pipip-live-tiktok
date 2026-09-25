import path from 'node:path'; import { readFileSync } from 'node:fs';
import { AIConfigSchema } from '../packages/protocol/src/index.js';
import { OllamaProvider, OpenAICompatibleProvider, resolveAIConfig } from '../packages/ai-core/src/index.js';
import { HostEngine, HostPromptBuilder } from '../packages/host-engine/src/index.js';
import { Logger } from '../packages/logging/src/index.js';
import type { HostContext } from '../packages/shared-types/src/index.js';

const root = process.cwd();
const config = resolveAIConfig(AIConfigSchema.parse(JSON.parse(readFileSync(path.join(root, 'config/ai.json'), 'utf8'))),process.env);
const provider = config.provider === 'ollama' ? new OllamaProvider(config.baseUrl, config.model) : new OpenAICompatibleProvider(config.baseUrl, config.model, process.env.AI_API_KEY);
const engine = new HostEngine(provider, new HostPromptBuilder(path.join(root, 'data/prompts/host-system.md')), new Logger());
const context: HostContext = { sessionId: 'smoke-test', recentConversation: [], currentScene: 'AVATAR', humanHostPresent: false };

async function show(label: string, trigger: 'MANUAL'|'COMEDY', hostContext: HostContext, instruction: string) {
  const result = await engine.generate({ type: 'HOST_RESPONSE', trigger, context: hostContext, instruction });
  if (!result.ok) { console.error(`${result.code}: ${result.message}`); process.exitCode = 1; return null; }
  console.log(`\n${label}`); console.log(result.response.speech);
  console.log(`Emotion: ${result.response.emotion} | Gesture: ${result.response.gesture} | Intent: ${result.response.intent}`);
  console.log(`Validated commands: ${result.commands.map(command => command.type).join(', ')}`);
  return result;
}

const intro = await show('AI HOST INTRODUCTION', 'MANUAL', context, 'Perkenalkan dirimu sebagai host AI dalam satu atau dua kalimat singkat.');
if (intro?.ok) {
  const recentConversation = [{ role: 'host' as const, text: intro.response.speech, timestamp: new Date().toISOString() }];
  await show('HUMAN CONTEXT REACTION (simulated coding co-host)', 'COMEDY', { ...context, humanHostPresent: true, humanHostState: 'coding', recentConversation }, 'React naturally to the co-host coding while the live is underway. Keep any playful humor gentle and specific to this moment.');
}
