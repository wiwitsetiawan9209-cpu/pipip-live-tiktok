// packages/voice-engine/src/providers/local-tts.ts
import { spawn } from "node:child_process";
import { mkdir as mkdir2, stat as stat2 } from "node:fs/promises";
import path2 from "node:path";

// packages/voice-engine/src/speech-cache.ts
import { createHash } from "node:crypto";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
var SpeechCache = class {
  constructor(directory, maxEntries = 200, now = () => Date.now()) {
    this.directory = directory;
    this.maxEntries = maxEntries;
    this.now = now;
  }
  memory = /* @__PURE__ */ new Map();
  key(request, providerId) {
    return createHash("sha256").update([normalize(request.text), request.voice, request.language, request.speed, request.pitch, request.emotion ?? "", providerId, request.format, request.sampleRate ?? ""].join("|")).digest("hex");
  }
  async get(key) {
    const cached = this.memory.get(key);
    if (cached?.audioRef) {
      try {
        const info = await stat(cached.audioRef);
        if (info.size > 44) {
          this.memory.delete(key);
          this.memory.set(key, cached);
          return { ...cached, createdAt: this.now() };
        }
      } catch {
      }
      this.memory.delete(key);
    }
    return void 0;
  }
  async put(key, result) {
    if (!result.success || !result.audioRef) return;
    await mkdir(this.directory, { recursive: true });
    this.memory.set(key, { ...result });
    while (this.memory.size > this.maxEntries) {
      const oldest = this.memory.keys().next().value;
      if (oldest) this.memory.delete(oldest);
      else break;
    }
    await this.pruneDisk();
  }
  async clear() {
    this.memory.clear();
    await mkdir(this.directory, { recursive: true });
    const files = await readdir(this.directory).catch(() => []);
    await Promise.all(files.filter((x) => /^[a-f0-9]{64}\.wav$/.test(x)).map((x) => rm(path.join(this.directory, x), { force: true })));
  }
  pathFor(key) {
    return path.join(this.directory, `${key}.wav`);
  }
  get size() {
    return this.memory.size;
  }
  async pruneDisk() {
    const entries = await readdir(this.directory, { withFileTypes: true }).catch(() => []);
    const wav = await Promise.all(entries.filter((x) => x.isFile() && /^[a-f0-9]{64}\.wav$/.test(x.name)).map(async (x) => ({ file: path.join(this.directory, x.name), time: (await stat(path.join(this.directory, x.name))).mtimeMs })));
    wav.sort((a, b) => b.time - a.time);
    await Promise.all(wav.slice(this.maxEntries).map((x) => rm(x.file, { force: true })));
  }
};
function normalize(text) {
  return text.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

// packages/voice-engine/src/providers/local-tts.ts
var SCRIPT = String.raw`
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
  if ($payload.voice -and $payload.voice -ne 'default') { $chosen = $voices | Where-Object { $_.name -eq $payload.voice } | Select-Object -First 1 }
  if (-not $chosen -and $payload.language) { $chosen = $voices | Where-Object { $_.language -eq $payload.language -or $_.language.StartsWith($payload.language + '-') } | Select-Object -First 1 }
  if (-not $chosen) { $chosen = $voices | Select-Object -First 1 }
  $synth.SelectVoice($chosen.name)
  $synth.Rate = [Math]::Max(-10, [Math]::Min(10, [int][Math]::Round(($payload.speed - 1.0) * 10)))
  $synth.SetOutputToWaveFile($payload.outputPath)
  $synth.Speak($payload.text)
  $synth.SetOutputToNull()
  @{ ok=$true; voice=$chosen.name; language=$chosen.language } | ConvertTo-Json -Compress -Depth 4
} finally { $synth.Dispose() }
`;
var LocalSapiTtsProvider = class {
  constructor(options) {
    this.options = options;
    this.platform = options.platform ?? process.platform;
    this.runProcess = options.run ?? defaultPowerShellRunner(options.powershellPath ?? "powershell.exe", (child) => {
      this.activeChild = child;
    });
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 3e4;
    this.powershellPath = options.powershellPath ?? "powershell.exe";
  }
  id = "local-sapi";
  platform;
  runProcess;
  now;
  timeoutMs;
  powershellPath;
  activeChild = null;
  voicesCache = null;
  async isAvailable() {
    if (this.platform !== "win32") return false;
    try {
      return (await this.listVoices()).length > 0;
    } catch {
      return false;
    }
  }
  async listVoices() {
    if (this.voicesCache) return this.voicesCache.map((x) => ({ ...x }));
    if (this.platform !== "win32") return [];
    const result = await this.runProcess(SCRIPT, JSON.stringify({ action: "voices" }), Math.min(this.timeoutMs, 8e3));
    if (result.code !== 0) return [];
    const voices = parseJson(result.stdout)?.voices;
    this.voicesCache = Array.isArray(voices) ? voices.filter((x) => Boolean(x && typeof x.name === "string" && typeof x.language === "string")) : [];
    return this.voicesCache.map((x) => ({ ...x }));
  }
  async synthesize(request, signal) {
    const createdAt = this.now();
    if (signal?.aborted) return failure(this.id, "Synthesis cancelled", createdAt);
    if (this.platform !== "win32") return failure(this.id, "Windows SAPI is available only on Windows.", createdAt);
    if (request.format !== "wav" || request.text.length < 1 || request.text.length > 4e3) return failure(this.id, "Invalid TTS request.", createdAt);
    const key = new SpeechCache(this.options.outputDirectory).key(request, this.id);
    const outputPath = path2.resolve(this.options.outputDirectory, `${key}.wav`);
    try {
      await mkdir2(this.options.outputDirectory, { recursive: true });
      const result = await this.runProcess(SCRIPT, JSON.stringify({ action: "synthesize", text: request.text, voice: request.voice, language: request.language, speed: request.speed, outputPath }), this.timeoutMs);
      if (signal?.aborted) return failure(this.id, "Synthesis cancelled", this.now());
      if (result.code !== 0) return failure(this.id, safeError(result.stderr || result.stdout), this.now());
      const metadata = parseJson(result.stdout);
      const audio = await inspectWav(outputPath);
      if (!metadata?.ok || !audio || audio.durationMs <= 0) return failure(this.id, "TTS returned invalid or empty WAV audio.", this.now());
      return { success: true, providerId: this.id, audioRef: outputPath, durationMs: audio.durationMs, format: "wav", sampleRate: audio.sampleRate, channels: audio.channels, createdAt, actualVoice: metadata.voice, actualLanguage: metadata.language };
    } catch (error) {
      return failure(this.id, error instanceof Error ? safeError(error.message) : "Local TTS failed.", this.now());
    }
  }
  async stop() {
    this.activeChild?.kill();
    this.activeChild = null;
  }
  getPowerShellPath() {
    return this.powershellPath;
  }
};
function defaultPowerShellRunner(executable, setChild) {
  return (script, input, timeoutMs) => new Promise((resolve, reject) => {
    const child = spawn(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], shell: false });
    setChild(child);
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("TTS synthesis timed out"));
    }, timeoutMs);
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      setChild(null);
      error ? reject(error) : resolve(result);
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk).slice(-32e3);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-8e3);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => finish(void 0, { code, stdout, stderr }));
    child.stdin.on("error", () => void 0);
    child.stdin.end(input);
  });
}
function parseJson(text) {
  const candidates = text.trim().split(/\r?\n/).reverse();
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
    }
  }
  return null;
}
function safeError(text) {
  return text.replace(/[\r\n]+/g, " ").slice(0, 240) || "Local TTS failed.";
}
function failure(providerId, error, createdAt) {
  return { success: false, providerId, durationMs: null, format: "wav", sampleRate: null, channels: null, createdAt, error };
}
async function inspectWav(file) {
  const info = await stat2(file);
  if (info.size < 44 || info.size > 5e7) return null;
  const { open } = await import("node:fs/promises");
  const handle = await open(file, "r");
  try {
    const header = Buffer.alloc(64 * 1024);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 12) !== "WAVE") return null;
    const channels = header.readUInt16LE(22);
    const sampleRate = header.readUInt32LE(24);
    let offset = 12;
    let dataSize = 0;
    while (offset + 8 <= bytesRead) {
      const id = header.toString("ascii", offset, offset + 4);
      const size = header.readUInt32LE(offset + 4);
      if (id === "data") {
        dataSize = size;
        break;
      }
      offset += 8 + size + size % 2;
    }
    const byteRate = header.readUInt32LE(28);
    return channels > 0 && sampleRate > 0 && byteRate > 0 && dataSize > 0 ? { channels, sampleRate, durationMs: Math.round(dataSize * 1e3 / byteRate) } : null;
  } finally {
    await handle.close();
  }
}
export {
  LocalSapiTtsProvider
};
