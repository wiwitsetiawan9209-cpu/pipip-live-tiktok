import { createReadStream } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { MusicCategory, MusicLibraryConfig, MusicTrack } from './types.js';

export interface AudioMetadataReader {
  read(filePath: string): Promise<Partial<Pick<MusicTrack, 'title' | 'artist' | 'durationMs' | 'genre' | 'mood' | 'themes'>>>;
}

const SUPPORTED = new Set(['.mp3', '.wav', '.m4a', '.ogg']);
const MPEG1_LAYER3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2_LAYER3_KBPS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

export class LocalMusicFileProvider {
  constructor(private config: MusicLibraryConfig, private metadata?: AudioMetadataReader) {}

  async scan(): Promise<{ tracks: MusicTrack[]; duplicates: Array<{ keptId: string; duplicatePath: string }>; errors: Array<{ path: string; code: 'UNAVAILABLE' | 'TOO_LARGE' | 'UNREADABLE' }> }> {
    const tracks: MusicTrack[] = [];
    const duplicates: Array<{ keptId: string; duplicatePath: string }> = [];
    const errors: Array<{ path: string; code: 'UNAVAILABLE' | 'TOO_LARGE' | 'UNREADABLE' }> = [];
    const extensions = new Set((this.config.extensions ?? [...SUPPORTED]).map(x => x.toLowerCase().startsWith('.') ? x.toLowerCase() : `.${x.toLowerCase()}`));
    const byHash = new Map<string, string>();
    for (const root of this.config.directories) {
      const resolved = path.resolve(root);
      await this.walk(resolved, resolved, extensions, tracks, duplicates, errors, byHash);
    }
    return { tracks, duplicates, errors };
  }

  private async walk(root: string, dir: string, extensions: Set<string>, tracks: MusicTrack[], duplicates: Array<{ keptId: string; duplicatePath: string }>, errors: Array<{ path: string; code: 'UNAVAILABLE' | 'TOO_LARGE' | 'UNREADABLE' }>, byHash: Map<string, string>) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { errors.push({ path: dir, code: 'UNAVAILABLE' }); return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { await this.walk(root, full, extensions, tracks, duplicates, errors, byHash); continue; }
      if (!entry.isFile() || !extensions.has(path.extname(entry.name).toLowerCase())) continue;
      let info;
      try { info = await stat(full); } catch { errors.push({ path: full, code: 'UNREADABLE' }); continue; }
      if (this.config.maxFileBytes && info.size > this.config.maxFileBytes) { errors.push({ path: full, code: 'TOO_LARGE' }); continue; }
      let hash: string;
      try { hash = await hashFile(full); } catch { errors.push({ path: full, code: 'UNREADABLE' }); continue; }
      const previous = byHash.get(hash);
      if (previous) { duplicates.push({ keptId: previous, duplicatePath: full }); continue; }
      const relative = path.relative(root, full);
      const id = `track-${createHash('sha256').update(`${path.resolve(root)}|${relative.toLowerCase()}`).digest('hex').slice(0, 20)}`;
      byHash.set(hash, id);
      let extra: Partial<MusicTrack> = {};
      try { extra = await this.metadata?.read(full) ?? {}; } catch { /* Invalid tags remain unknown. */ }
      let basic: BasicAudioMetadata = {};
      if (extra.durationMs == null || !extra.title || !extra.artist) {
        try { basic = await readBasicMetadata(full, path.extname(full).toLowerCase(), info.size); } catch { /* Optional header parsing must not hide a scanned file. */ }
      }
      const title = extra.title?.trim() || basic.title || path.basename(full, path.extname(full));
      const folder = path.basename(path.dirname(full)).toLowerCase();
      const category: MusicCategory = folder.includes('background') ? 'BACKGROUND' : folder.includes('transition') ? 'TRANSITION' : folder.includes('emergency') ? 'EMERGENCY' : 'FULL_SONG';
      const durationMs = Number.isFinite(extra.durationMs) && extra.durationMs! > 0 ? extra.durationMs! : basic.durationMs ?? null;
      tracks.push({
        id, title, artist: extra.artist?.trim() || basic.artist || null, filePath: full, durationMs,
        ...(durationMs !== null && extra.durationMs == null && basic.durationEstimated ? { durationEstimated: true } : {}),
        category, genre: extra.genre?.trim() || basic.genre || null, mood: extra.mood ?? [], themes: extra.themes ?? [],
        lyricsId: null, enabled: true, sizeBytes: info.size, contentHash: hash,
      });
    }
  }
}

type BasicAudioMetadata = { title?: string; artist?: string; genre?: string; durationMs?: number; durationEstimated?: boolean };

async function readBasicMetadata(filePath: string, extension: string, fileSize: number): Promise<BasicAudioMetadata> {
  if (extension === '.wav') return readWavMetadata(filePath);
  if (extension === '.mp3') return readMp3Metadata(filePath, fileSize);
  return {};
}

async function readWavMetadata(filePath: string): Promise<BasicAudioMetadata> {
  const file = await open(filePath, 'r');
  try {
    const header = Buffer.alloc(64 * 1024);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    if (bytesRead < 44 || header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') return {};
    let offset = 12;
    let byteRate = 0;
    let dataSize = 0;
    while (offset + 8 <= bytesRead) {
      const chunkId = header.toString('ascii', offset, offset + 4);
      const chunkSize = header.readUInt32LE(offset + 4);
      const chunkStart = offset + 8;
      if (chunkId === 'fmt ' && chunkSize >= 16 && chunkStart + 16 <= bytesRead) byteRate = header.readUInt32LE(chunkStart + 8);
      if (chunkId === 'data') { dataSize = chunkSize; break; }
      offset = chunkStart + chunkSize + (chunkSize % 2);
    }
    return byteRate > 0 && dataSize > 0 ? { durationMs: Math.round(dataSize * 1000 / byteRate) } : {};
  } finally { await file.close(); }
}

async function readMp3Metadata(filePath: string, fileSize: number): Promise<BasicAudioMetadata> {
  const file = await open(filePath, 'r');
  try {
    const head = Buffer.alloc(Math.min(256 * 1024, fileSize));
    const { bytesRead } = await file.read(head, 0, head.length, 0);
    let offset = 0;
    if (bytesRead >= 10 && head.toString('ascii', 0, 3) === 'ID3') {
      const tagSize = syncSafeInt(head, 6);
      offset = tagSize === null ? 10 : 10 + tagSize + ((head[5]! & 0x10) ? 10 : 0);
    }
    for (let i = offset; i + 4 <= bytesRead; i++) {
      const word = head.readUInt32BE(i);
      if (((word & 0xffe00000) >>> 0) !== 0xffe00000) continue;
      const version = (word >>> 19) & 0b11;
      const layer = (word >>> 17) & 0b11;
      const bitrateIndex = (word >>> 12) & 0b1111;
      const sampleRateIndex = (word >>> 10) & 0b11;
      if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) continue;
      const kbps = (version === 3 ? MPEG1_LAYER3_KBPS : MPEG2_LAYER3_KBPS)[bitrateIndex]!;
      if (!kbps) continue;
      const durationMs = Math.round(Math.max(0, fileSize - i) * 8 / (kbps * 1000) * 1000);
      return durationMs > 0 ? { durationMs, durationEstimated: true } : {};
    }
    return {};
  } finally { await file.close(); }
}

function syncSafeInt(bytes: Buffer, offset: number): number | null {
  if (offset + 4 > bytes.length) return null;
  const parts = [bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!];
  if (parts.some(x => x & 0x80)) return null;
  return parts[0]! * 0x20_00_00 + parts[1]! * 0x40_00 + parts[2]! * 0x80 + parts[3]!;
}

function hashFile(file: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256'); const stream = createReadStream(file);
    stream.on('data', chunk => hash.update(chunk)); stream.on('error', reject); stream.on('end', () => resolve(hash.digest('hex')));
  });
}
