import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { SpeechCache } from '../speech-cache.js';
import type { TTSProvider, TTSRequest, TTSResult, TTSVoice } from '../types.js';

export interface ProcessResult { code: number | null; stdout: string; stderr: string }
export type PowerShellRunner = (script: string, input: string, timeoutMs: number) => Promise<ProcessResult>;
export interface LocalTtsOptions { outputDirectory: string; timeoutMs?: number; platform?: NodeJS.Platform; powershellPath?: string; run?: PowerShellRunner; now?: () => number }

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { @{ name=$_.VoiceInfo.Name; language=$_.VoiceInfo.Culture.Name; gender=$_.VoiceInfo.Gender.ToString(); age=$_.VoiceInfo.Age.ToString() } })
  if ($payload.action -eq 'voices') { @{ voices=$voices } | ConvertTo-Json -Compress -Depth 4; exit 0 }
  if ($voices.Count -eq 0) { throw 'No enabled Windows speech voices are installed.' }
  $chosen = $null
  if ($payload.voice -and $payload.voice -ne 'default' -and $payload.voice -ne 'auto') { $chosen = $voices | Where-Object { $_.name -eq $payload.voice } | Select-Object -First 1 }
  if (-not $chosen -and $payload.language) { $chosen = $voices | Where-Object { $_.language -eq $payload.language } | Select-Object -First 1 }
  if (-not $chosen) { throw 'NO_VOICE_FOR_REQUESTED_LANGUAGE' }
  $synth.SelectVoice($chosen.name)
  $synth.Rate = [Math]::Max(-10, [Math]::Min(10, [int][Math]::Round(($payload.speed - 1.0) * 10)))
  $synth.SetOutputToWaveFile($payload.outputPath)
  $synth.Speak($payload.text)
  $synth.SetOutputToNull()
  @{ ok=$true; voice=$chosen.name; language=$chosen.language } | ConvertTo-Json -Compress -Depth 4
} finally { $synth.Dispose() }
`;

export class LocalSapiTtsProvider implements TTSProvider {
  readonly id = 'local-sapi';
  private readonly platform: NodeJS.Platform;
  private readonly runProcess: PowerShellRunner;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly powershellPath: string;
  private activeChild: ReturnType<typeof spawn> | null = null;
  private voicesCache: TTSVoice[] | null = null;

  constructor(private readonly options: LocalTtsOptions) {
    this.platform = options.platform ?? process.platform;
    this.runProcess = options.run ?? createPowerShellRunner(options.powershellPath ?? 'powershell.exe', child => { this.activeChild = child; });
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.powershellPath = options.powershellPath ?? 'powershell.exe';
  }

  async isAvailable() {
    if (this.platform !== 'win32') return false;
    try { return (await this.listVoices()).length > 0; } catch { return false; }
  }

  async listVoices(): Promise<TTSVoice[]> {
    if (this.voicesCache) return this.voicesCache.map(x => ({ ...x }));
    if (this.platform !== 'win32') return [];
    const result = await this.runProcess(SCRIPT, JSON.stringify({ action: 'voices' }), Math.min(this.timeoutMs, 8000));
    if (result.code !== 0) return [];
    const voices = parseJson(result.stdout)?.voices;
    this.voicesCache = Array.isArray(voices) ? voices.filter((x): x is TTSVoice => Boolean(x && typeof x.name === 'string' && typeof x.language === 'string')).map(v=>({...v,id:v.name,locale:v.language,available:true,capabilities:['installed-sapi','wav']})) : [];
    return this.voicesCache.map(x => ({ ...x }));
  }

  async synthesize(request: TTSRequest, signal?: AbortSignal): Promise<TTSResult> {
    const createdAt = this.now();
    if (signal?.aborted) return failure(this.id, 'Synthesis cancelled', createdAt);
    if (this.platform !== 'win32') return failure(this.id, 'Windows SAPI is available only on Windows.', createdAt);
    if (request.format !== 'wav' || request.text.length < 1 || request.text.length > 4000) return failure(this.id, 'Invalid TTS request.', createdAt);
    const key = new SpeechCache(this.options.outputDirectory).key(request, this.id);
    const outputPath = path.resolve(this.options.outputDirectory, `${key}.wav`);
    try {
      await mkdir(this.options.outputDirectory, { recursive: true });
      const result = await this.runProcess(SCRIPT, JSON.stringify({ action: 'synthesize', text: request.text, voice: request.voice, language: request.language, speed: request.speed, outputPath }), this.timeoutMs);
      if (signal?.aborted) return failure(this.id, 'Synthesis cancelled', this.now());
      if (result.code !== 0) return failure(this.id, safeError(result.stderr || result.stdout), this.now());
      const metadata = parseJson(result.stdout);
      const audio = await inspectWav(outputPath);
      if (!metadata?.ok || !audio || audio.durationMs <= 0) return failure(this.id, 'TTS returned invalid or empty WAV audio.', this.now());
      return { success: true, providerId: this.id, audioRef: outputPath, durationMs: audio.durationMs, format: 'wav', sampleRate: audio.sampleRate, channels: audio.channels, createdAt, actualVoice: metadata.voice, actualLanguage: metadata.language };
    } catch (error) { return failure(this.id, error instanceof Error ? safeError(error.message) : 'Local TTS failed.', this.now()); }
  }

  async stop() { this.activeChild?.kill(); this.activeChild = null; }
  getPowerShellPath() { return this.powershellPath; }
}

export function createPowerShellRunner(executable = 'powershell.exe', setChild: (child: ReturnType<typeof spawn>) => void = () => {}): PowerShellRunner {
  return (script, input, timeoutMs) => new Promise((resolve, reject) => {
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    setChild(child);
    let stdout = ''; let stderr = ''; let settled = false;
    const timer = setTimeout(() => { child.kill(); finish(new Error('TTS synthesis timed out')); }, timeoutMs);
    const finish = (error?: Error, result?: ProcessResult) => { if (settled) return; settled = true; clearTimeout(timer); setChild(null as unknown as ReturnType<typeof spawn>); error ? reject(error) : resolve(result!); };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-32_000); }); child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); });
    child.on('error', error => finish(error)); child.on('close', code => finish(undefined, { code, stdout, stderr }));
    child.stdin.on('error', () => undefined); child.stdin.end(input);
  });
}

function parseJson(text: string): any { const candidates = text.trim().split(/\r?\n/).reverse(); for (const candidate of candidates) { try { return JSON.parse(candidate); } catch { /* PowerShell startup messages are ignored. */ } } return null; }
function safeError(text: string) { return text.replace(/[\r\n]+/g, ' ').slice(0, 240) || 'Local TTS failed.'; }
function failure(providerId: string, error: string, createdAt: number): TTSResult { return { success: false, providerId, durationMs: null, format: 'wav', sampleRate: null, channels: null, createdAt, error }; }
export async function inspectWav(file: string): Promise<{ durationMs: number; sampleRate: number; channels: number } | null> {
  const info = await stat(file); if (info.size < 44 || info.size > 50_000_000) return null;
  const { open } = await import('node:fs/promises'); const handle = await open(file, 'r');
  try {
    const header = Buffer.alloc(64 * 1024); const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') return null;
    const channels = header.readUInt16LE(22); const sampleRate = header.readUInt32LE(24); let offset = 12; let dataSize = 0;
    while (offset + 8 <= bytesRead) { const id = header.toString('ascii', offset, offset + 4); const size = header.readUInt32LE(offset + 4); if (id === 'data') { dataSize = size; break; } offset += 8 + size + (size % 2); }
    const byteRate = header.readUInt32LE(28); return channels > 0 && sampleRate > 0 && byteRate > 0 && dataSize > 0 ? { channels, sampleRate, durationMs: Math.round(dataSize * 1000 / byteRate) } : null;
  } finally { await handle.close(); }
}
