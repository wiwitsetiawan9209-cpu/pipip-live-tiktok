import type { AIHealthStatus, AIRequest, AIResponse } from '../../shared-types/src/index.js';
import { AIRequestSchema } from '../../protocol/src/index.js';
import type { AIProvider } from './index.js';

type OllamaChatResponse = { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
type CompatibleResponse = { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };

export class OllamaProvider implements AIProvider {
  constructor(private readonly baseUrl: string, private readonly model: string, private readonly fetcher: typeof fetch = fetch, private readonly timeoutMs=60000) {}
  private get endpoint(){return this.baseUrl.replace(/\/$/,'')}
  getName() { return 'ollama'; }
  async healthCheck(): Promise<AIHealthStatus> {
    try {
      const response = await this.fetcher(`${this.endpoint}/api/tags`, { signal: AbortSignal.timeout(2500) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as { models?: Array<{ name?: string }> };
      const modelAvailable = this.model ? (body.models ?? []).some(item => item.name === this.model) : undefined;
      return { available: true, provider: this.getName(), ...(this.model ? { model: this.model, modelAvailable: modelAvailable === true } : {}), ...(modelAvailable === false ? { message: 'MODEL NOT FOUND' } : {}) };
    } catch (error) {
      return { available: false, provider: this.getName(), ...(this.model ? { model: this.model } : {}), message: error instanceof Error&&error.name==='TimeoutError'?'OLLAMA_TIMEOUT':'OLLAMA_UNAVAILABLE' };
    }
  }
  async generate(request: AIRequest): Promise<AIResponse> {
    AIRequestSchema.parse(request);
    if (!this.model) throw new Error('MODEL_NOT_FOUND');
    const started = Date.now();
    const response = await this.fetcher(`${this.endpoint}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, stream: false, format: 'json', messages: [{ role: 'system', content: request.systemPrompt }, { role: 'user', content: request.userPrompt }], options: { ...(request.temperature !== undefined ? { temperature: request.temperature } : {}), ...(request.maxTokens !== undefined ? { num_predict: request.maxTokens } : {}) } }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!response.ok) throw new Error(response.status === 404 ? 'MODEL_NOT_FOUND' : `Ollama request failed: HTTP ${response.status}`);
    const body = await response.json() as OllamaChatResponse;
    return { text: body.message?.content ?? '', provider: this.getName(), model: this.model, latencyMs: Date.now() - started, ...(body.prompt_eval_count !== undefined || body.eval_count !== undefined ? { usage: { ...(body.prompt_eval_count !== undefined ? { inputTokens: body.prompt_eval_count } : {}), ...(body.eval_count !== undefined ? { outputTokens: body.eval_count } : {}) } } : {}) };
  }
}

export class OpenAICompatibleProvider implements AIProvider {
  constructor(private readonly baseUrl: string, private readonly model: string, private readonly apiKey?: string, private readonly fetcher: typeof fetch = fetch) {}
  getName() { return 'openai-compatible'; }
  async healthCheck(): Promise<AIHealthStatus> {
    const ready = Boolean(this.baseUrl && this.model);
    return { available: ready, provider: this.getName(), ...(this.model ? { model: this.model, modelAvailable: true } : {}), ...(!ready ? { message: 'Provider URL and model are required.' } : {}) };
  }
  async generate(request: AIRequest): Promise<AIResponse> {
    AIRequestSchema.parse(request);
    if (!this.model) throw new Error('A model is required.');
    const started = Date.now();
    const response = await this.fetcher(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ model: this.model, messages: [{ role: 'system', content: request.systemPrompt }, { role: 'user', content: request.userPrompt }], ...(request.temperature !== undefined ? { temperature: request.temperature } : {}), ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}) }),
      signal: AbortSignal.timeout(60000)
    });
    if (!response.ok) throw new Error(`Compatible provider request failed: HTTP ${response.status}`);
    const body = await response.json() as CompatibleResponse;
    return { text: body.choices?.[0]?.message?.content ?? '', provider: this.getName(), model: this.model, latencyMs: Date.now() - started, ...(body.usage ? { usage: { ...(body.usage.prompt_tokens !== undefined ? { inputTokens: body.usage.prompt_tokens } : {}), ...(body.usage.completion_tokens !== undefined ? { outputTokens: body.usage.completion_tokens } : {}) } } : {}) };
  }
}
