import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { TTSRequest, TTSResult } from './types.js';
export class SpeechCache {
  private memory = new Map<string, TTSResult>();
  constructor(private readonly directory: string, private readonly maxEntries = 200, private readonly now = () => Date.now()) {}
  key(request: TTSRequest, providerId: string) { return createHash('sha256').update([normalize(request.text), request.voice, request.language, request.speed, request.pitch, request.emotion ?? '', providerId, request.format, request.sampleRate ?? ''].join('|')).digest('hex'); }
  async get(key: string): Promise<TTSResult | undefined> { const cached = this.memory.get(key); if (cached?.audioRef) { try { const info = await stat(cached.audioRef); if (info.size > 44) { this.memory.delete(key); this.memory.set(key, cached); return { ...cached, createdAt: this.now() }; } } catch { /* Cache file was removed. */ } this.memory.delete(key); } return undefined; }
  async put(key: string, result: TTSResult) { if (!result.success || !result.audioRef) return; await mkdir(this.directory, { recursive: true }); this.memory.set(key, { ...result }); while (this.memory.size > this.maxEntries) { const oldest = this.memory.keys().next().value; if (oldest) this.memory.delete(oldest); else break; } await this.pruneDisk(); }
  async clear() { this.memory.clear(); await mkdir(this.directory, { recursive: true }); const files = await readdir(this.directory).catch(() => []); await Promise.all(files.filter(x => /^[a-f0-9]{64}\.wav$/.test(x)).map(x => rm(path.join(this.directory, x), { force: true }))); }
  pathFor(key: string) { return path.join(this.directory, `${key}.wav`); }
  get size() { return this.memory.size; }
  private async pruneDisk() { const entries = await readdir(this.directory, { withFileTypes: true }).catch(() => []); const wav = await Promise.all(entries.filter(x => x.isFile() && /^[a-f0-9]{64}\.wav$/.test(x.name)).map(async x => ({ file: path.join(this.directory, x.name), time: (await stat(path.join(this.directory, x.name))).mtimeMs }))); wav.sort((a, b) => b.time - a.time); await Promise.all(wav.slice(this.maxEntries).map(x => rm(x.file, { force: true }))); }
}
function normalize(text: string) { return text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
