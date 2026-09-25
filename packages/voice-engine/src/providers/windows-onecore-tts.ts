import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { SpeechCache } from '../speech-cache.js';
import type { TTSProvider, TTSRequest, TTSResult, TTSVoice } from '../types.js';
import { createPowerShellRunner, inspectWav, type PowerShellRunner } from './local-tts.js';

export interface WindowsOneCoreOptions { outputDirectory:string; timeoutMs?:number; platform?:NodeJS.Platform; powershellPath?:string; run?:PowerShellRunner; now?:()=>number }

const SCRIPT=String.raw`
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

export class WindowsOneCoreTtsProvider implements TTSProvider {
  readonly id='windows-onecore';
  private readonly run:PowerShellRunner; private readonly now:()=>number; private readonly timeoutMs:number; private readonly platform:NodeJS.Platform; private voiceCache:TTSVoice[]|null=null;private activeChild:ReturnType<typeof spawn>|null=null;
  constructor(private readonly options:WindowsOneCoreOptions){this.platform=options.platform??process.platform;this.run=options.run??createPowerShellRunner(options.powershellPath??'powershell.exe',child=>{this.activeChild=child});this.now=options.now??Date.now;this.timeoutMs=options.timeoutMs??30_000;}
  async isAvailable(){return(await this.listVoices()).length>0;}
  async listVoices():Promise<TTSVoice[]>{if(this.platform!=='win32')return[];if(this.voiceCache)return this.voiceCache.map(v=>({...v}));try{const r=await this.run(SCRIPT,JSON.stringify({action:'voices'}),Math.min(this.timeoutMs,8000));const voices=parseJson(r.stdout)?.voices;if(r.code!==0||!Array.isArray(voices))return[];this.voiceCache=voices.filter((v):v is TTSVoice=>Boolean(v&&typeof v.id==='string'&&typeof v.name==='string'&&typeof v.language==='string')).map(v=>({...v,provider:this.id,locale:v.locale??v.language,available:true,capabilities:['windows-onecore','wav']}));return this.voiceCache.map(v=>({...v}));}catch{return[]}}
  async getCapabilities(){const voices=await this.listVoices();return{providerId:this.id,local:true,languages:[...new Set(voices.map(v=>v.language))],formats:['wav']};}
  async stop(){this.activeChild?.kill();this.activeChild=null;}
  async synthesize(request:TTSRequest,signal?:AbortSignal):Promise<TTSResult>{const createdAt=this.now();if(signal?.aborted)return failed('Synthesis cancelled',createdAt);if(this.platform!=='win32')return failed('Windows OneCore speech is available only on Windows.',createdAt);if(request.format!=='wav'||request.text.length<1||request.text.length>4000)return failed('Invalid TTS request.',createdAt);const language=normalizeLanguage(request.language);const voices=await this.listVoices();const candidates=voices.filter(v=>normalizeLanguage(v.language)===language);if(!candidates.length)return{...failed('No installed voice for requested language.',createdAt),errorCode:language==='id-id'?'NO_ID_ID_VOICE':'TTS_FAILURE'};const selected=candidates.find(v=>v.id===request.voice||v.name===request.voice)??(request.voice==='auto'||request.voice==='default'?candidates[0]:undefined);if(!selected)return failed('Requested voice is not installed for this language.',createdAt);const key=new SpeechCache(this.options.outputDirectory).key(request,this.id);const outputPath=path.resolve(this.options.outputDirectory,`${key}.wav`);const started=this.now();try{await mkdir(this.options.outputDirectory,{recursive:true});const r=await this.run(SCRIPT,JSON.stringify({action:'synthesize',text:request.text,voiceId:selected.id,language:selected.language,outputPath}),this.timeoutMs);if(signal?.aborted)return failed('Synthesis cancelled.',this.now());const meta=parseJson(r.stdout);const audio=await inspectWav(outputPath);if(r.code!==0||!meta?.ok||normalizeLanguage(meta.language)!==language||meta.voiceId!==selected.id||!audio||audio.durationMs<=0)return{...failed('OneCore synthesis failed or returned invalid audio.',this.now()),errorCode:language==='id-id'&&!meta?.ok?'NO_ID_ID_VOICE':'TTS_FAILURE'};return{success:true,providerId:this.id,audioRef:outputPath,durationMs:audio.durationMs,format:'wav',sampleRate:audio.sampleRate,channels:audio.channels,createdAt,actualVoice:meta.voice,actualLanguage:meta.language,synthesisLatencyMs:Math.max(0,this.now()-started)}}catch(error){return{...failed(error instanceof Error?error.message.slice(0,240):'OneCore TTS failed.',this.now()),errorCode:'TTS_FAILURE'}}}
}
function parseJson(text:string):any{for(const line of text.trim().split(/\r?\n/).reverse()){try{return JSON.parse(line)}catch{/* PowerShell can emit unrelated startup text. */}}return null;}
function normalizeLanguage(language:string){return language.replaceAll('_','-').toLocaleLowerCase('en-US');}
function failed(error:string,createdAt:number):TTSResult{return{success:false,providerId:'windows-onecore',durationMs:null,format:'wav',sampleRate:null,channels:null,createdAt,error};}
