// packages/voice-engine/src/providers/windows-onecore-tts.ts
import { mkdir as mkdir3 } from "node:fs/promises";
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
import { spawn } from "node:child_process";
import { mkdir as mkdir2, stat as stat2 } from "node:fs/promises";
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
function createPowerShellRunner(executable = "powershell.exe", setChild = () => {
}) {
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

// packages/voice-engine/src/providers/windows-onecore-tts.ts
var SCRIPT2 = String.raw`
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$payload=[Console]::In.ReadToEnd()|ConvertFrom-Json
Add-Type -AssemblyName System.Runtime.WindowsRuntime
if($payload.action -eq 'voices'){
  $voices=@([Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]::AllVoices|ForEach-Object{@{id=$_.Id;name=$_.DisplayName;language=$_.Language;locale=$_.Language;gender=$_.Gender.ToString();available=$true}})
  @{voices=$voices}|ConvertTo-Json -Compress -Depth 5
  exit 0
}
$voice=[Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]::AllVoices|Where-Object{$_.Id -eq $payload.voiceId -and $_.Language -eq $payload.language}|Select-Object -First 1
if(-not $voice){throw 'NO_ID_ID_VOICE'}
$synth=[Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]::new()
try {
  $synth.Voice=$voice
  $op=$synth.SynthesizeTextToStreamAsync($payload.text)
  $method=[System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object{$_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters()[0].ParameterType.GetGenericTypeDefinition().FullName -like 'Windows.Foundation.IAsyncOperation*'}|Select-Object -First 1
  if(-not $method){throw 'Windows speech async bridge is unavailable.'}
  $streamTask=$method.MakeGenericMethod([Windows.Media.SpeechSynthesis.SpeechSynthesisStream,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]).Invoke($null,[object[]]@($op))
  $stream=$streamTask.GetAwaiter().GetResult()
  $reader=[Windows.Storage.Streams.DataReader,Windows.Storage,ContentType=WindowsRuntime]::new($stream.GetInputStreamAt(0))
  $load=$method.MakeGenericMethod([uint32]).Invoke($null,[object[]]@($reader.LoadAsync([uint32]$stream.Size)))
  $null=$load.GetAwaiter().GetResult()
  $bytes=[byte[]]::new([int]$stream.Size)
  $reader.ReadBytes($bytes)
  [System.IO.File]::WriteAllBytes($payload.outputPath,$bytes)
  @{ok=$true;voice=$voice.DisplayName;voiceId=$voice.Id;language=$voice.Language}|ConvertTo-Json -Compress -Depth 5
} finally {$synth.Dispose()}
`;
var WindowsOneCoreTtsProvider = class {
  constructor(options) {
    this.options = options;
    this.platform = options.platform ?? process.platform;
    this.run = options.run ?? createPowerShellRunner(options.powershellPath ?? "powershell.exe", (child) => {
      this.activeChild = child;
    });
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 3e4;
  }
  id = "windows-onecore";
  run;
  now;
  timeoutMs;
  platform;
  voiceCache = null;
  activeChild = null;
  async isAvailable() {
    return (await this.listVoices()).length > 0;
  }
  async listVoices() {
    if (this.platform !== "win32") return [];
    if (this.voiceCache) return this.voiceCache.map((v) => ({ ...v }));
    try {
      const r = await this.run(SCRIPT2, JSON.stringify({ action: "voices" }), Math.min(this.timeoutMs, 8e3));
      const voices2 = parseJson(r.stdout)?.voices;
      if (r.code !== 0 || !Array.isArray(voices2)) return [];
      this.voiceCache = voices2.filter((v) => Boolean(v && typeof v.id === "string" && typeof v.name === "string" && typeof v.language === "string")).map((v) => ({ ...v, provider: this.id, locale: v.locale ?? v.language, available: true, capabilities: ["windows-onecore", "wav"] }));
      return this.voiceCache.map((v) => ({ ...v }));
    } catch {
      return [];
    }
  }
  async getCapabilities() {
    const voices2 = await this.listVoices();
    return { providerId: this.id, local: true, languages: [...new Set(voices2.map((v) => v.language))], formats: ["wav"] };
  }
  async stop() {
    this.activeChild?.kill();
    this.activeChild = null;
  }
  async synthesize(request, signal) {
    const createdAt = this.now();
    if (signal?.aborted) return failed("Synthesis cancelled", createdAt);
    if (this.platform !== "win32") return failed("Windows OneCore speech is available only on Windows.", createdAt);
    if (request.format !== "wav" || request.text.length < 1 || request.text.length > 4e3) return failed("Invalid TTS request.", createdAt);
    const language = normalizeLanguage(request.language);
    const voices2 = await this.listVoices();
    const candidates = voices2.filter((v) => normalizeLanguage(v.language) === language);
    if (!candidates.length) return { ...failed("No installed voice for requested language.", createdAt), errorCode: language === "id-id" ? "NO_ID_ID_VOICE" : "TTS_FAILURE" };
    const selected = candidates.find((v) => v.id === request.voice || v.name === request.voice) ?? (request.voice === "auto" || request.voice === "default" ? candidates[0] : void 0);
    if (!selected) return failed("Requested voice is not installed for this language.", createdAt);
    const key = new SpeechCache(this.options.outputDirectory).key(request, this.id);
    const outputPath = path2.resolve(this.options.outputDirectory, `${key}.wav`);
    const started = this.now();
    try {
      await mkdir3(this.options.outputDirectory, { recursive: true });
      const r = await this.run(SCRIPT2, JSON.stringify({ action: "synthesize", text: request.text, voiceId: selected.id, language: selected.language, outputPath }), this.timeoutMs);
      if (signal?.aborted) return failed("Synthesis cancelled.", this.now());
      const meta = parseJson(r.stdout);
      const audio = await inspectWav(outputPath);
      if (r.code !== 0 || !meta?.ok || normalizeLanguage(meta.language) !== language || meta.voiceId !== selected.id || !audio || audio.durationMs <= 0) return { ...failed("OneCore synthesis failed or returned invalid audio.", this.now()), errorCode: language === "id-id" && !meta?.ok ? "NO_ID_ID_VOICE" : "TTS_FAILURE" };
      return { success: true, providerId: this.id, audioRef: outputPath, durationMs: audio.durationMs, format: "wav", sampleRate: audio.sampleRate, channels: audio.channels, createdAt, actualVoice: meta.voice, actualLanguage: meta.language, synthesisLatencyMs: Math.max(0, this.now() - started) };
    } catch (error) {
      return { ...failed(error instanceof Error ? error.message.slice(0, 240) : "OneCore TTS failed.", this.now()), errorCode: "TTS_FAILURE" };
    }
  }
};
function parseJson(text) {
  for (const line of text.trim().split(/\r?\n/).reverse()) {
    try {
      return JSON.parse(line);
    } catch {
    }
  }
  return null;
}
function normalizeLanguage(language) {
  return language.replaceAll("_", "-").toLocaleLowerCase("en-US");
}
function failed(error, createdAt) {
  return { success: false, providerId: "windows-onecore", durationMs: null, format: "wav", sampleRate: null, channels: null, createdAt, error };
}

// packages/voice-engine/src/indonesian-normalizer.ts
var INDONESIAN_PRONUNCIATION_PHRASES = [
  "Halo semuanya.",
  "Harganya delapan puluh sembilan ribu rupiah.",
  "Stoknya masih tersedia.",
  "Produk ini beratnya lima ratus gram.",
  "Kalau cocok, cek produknya di etalase.",
  "Yang baru masuk, merapat dulu.",
  "Menurut saya, bagian ini menarik."
];

// packages/voice-engine/src/voice-request.ts
import { randomUUID } from "node:crypto";
function createVoiceRequest(input, config, now = Date.now()) {
  const text = input.text.trim();
  if (!text || text.length > 4e3) throw new Error("Speech text must contain 1 to 4000 characters");
  const language = input.language?.trim() || config.language;
  const voice2 = input.voice?.trim() || config.voice;
  const speed = input.speed ?? config.speed;
  const pitch = input.pitch ?? config.pitch;
  if (language.length > 35 || voice2.length > 100 || !Number.isFinite(speed) || speed < 0.5 || speed > 2 || !Number.isFinite(pitch) || pitch < -12 || pitch > 12) throw new Error("Invalid voice settings");
  const priority = input.priority ?? "NORMAL";
  if (!["EMERGENCY", "HIGH", "NORMAL", "LOW"].includes(priority)) throw new Error("Invalid speech priority");
  const ttlMs = input.ttlMs ?? config.requestTtlMs;
  if (!Number.isInteger(ttlMs) || ttlMs < 100 || ttlMs > 36e5) throw new Error("Invalid speech request lifetime");
  return { id: randomUUID(), text, language, voice: voice2, speed, pitch, ...input.emotion ? { emotion: input.emotion.slice(0, 40) } : {}, format: "wav", priority, createdAt: now, expiresAt: now + ttlMs, cacheable: input.cacheable ?? true };
}

// packages/voice-engine/src/voice-settings.ts
var DEFAULT_VOICE_CONFIG = { enabled: true, provider: "local-sapi", language: "en-US", voice: "default", speed: 1, pitch: 0, volume: 1, requestTtlMs: 6e4, maxQueueSize: 40, maxRetries: 1, synthesisTimeoutMs: 3e4, cacheEnabled: true, cacheMaxEntries: 200 };

// work/phase6a-voice-smoke.ts
var provider = new WindowsOneCoreTtsProvider({ outputDirectory: "C:/Users/Admin/Downloads/Pipip Live Tiktok/work/phase6a-voice-smoke" });
var voices = await provider.listVoices();
var voice = voices.find((v) => v.language.toLowerCase() === "id-id");
var results = [];
for (const text of INDONESIAN_PRONUNCIATION_PHRASES) {
  const result = await provider.synthesize(createVoiceRequest({ text, language: "id-ID", voice: voice?.id, cacheable: false }, { ...DEFAULT_VOICE_CONFIG, language: "id-ID", voice: "auto" }));
  results.push({ text, success: result.success, voice: result.actualVoice, language: result.actualLanguage, durationMs: result.durationMs, sampleRate: result.sampleRate, channels: result.channels, latencyMs: result.synthesisLatencyMs, error: result.errorCode ?? result.error });
}
console.log(JSON.stringify({ voice, results }, null, 2));
if (!voice || results.some((x) => !x.success || x.language !== "id-ID" || !x.durationMs || !x.sampleRate)) process.exitCode = 1;
