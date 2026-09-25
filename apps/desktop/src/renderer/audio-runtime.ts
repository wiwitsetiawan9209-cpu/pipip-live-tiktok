import { AudioEngine, WebAudioBackend } from '../../../../packages/audio-engine/src/index.js';

export const audioEngine = new AudioEngine(new WebAudioBackend(undefined, event => {
  if(event.sourceId.startsWith('diagnostic:'))return;
  if (event.channel === 'VOICE' && event.type === 'PLAYBACK_ENDED') void window.desktop.voicePlaybackCompleted(event.sourceId, true);
  if (event.channel === 'VOICE' && event.type === 'PLAYBACK_ERROR') void window.desktop.voicePlaybackCompleted(event.sourceId, false);
  if (event.channel === 'MUSIC' && event.type === 'PLAYBACK_ENDED') void window.desktop.musicPlaybackCompleted(event.sourceId);
  if (event.channel === 'MUSIC' && event.type === 'PLAYBACK_ERROR') void window.desktop.musicPlaybackCompleted(event.sourceId);
}), {
  enabled: true, outputDevice: 'default', masterVolume: 1, voiceVolume: 1, musicVolume: 0.58, maxAssetBytes: 50_000_000,
  ducking: { enabled: true, musicLevelDuringVoice: 0.18, attackMs: 150, releaseMs: 500, fadeDurationMs: 200, minimumMusicLevel: 0 },
});

export async function handleAudioEvent(event: import('../../../../packages/shared-types/src/index.js').DesktopAudioEvent) {
  if (event.type === 'VOICE_READY') {
    const url = await window.desktop.resolveAudioAsset('voice', event.assetId);
    if (!url || !(await window.desktop.voicePlaybackStarted(event.requestId))) return;
    if (!(await audioEngine.play('VOICE', event.requestId, url, event.durationMs))) await window.desktop.voicePlaybackCompleted(event.requestId, false);
  } else if (event.type === 'PLAY_AUDIO') {
    const url = await window.desktop.resolveAudioAsset('music', event.assetId);
    if (url) await audioEngine.play(event.channel, event.assetId, url, event.durationMs, event.loop);
  } else if (event.type === 'VOICE_STOP') audioEngine.stop('VOICE');
  else if (event.type === 'VOICE_PAUSE') audioEngine.pause('VOICE');
  else if (event.type === 'VOICE_RESUME') audioEngine.resume('VOICE');
  else if (event.type === 'MUSIC_STOP') audioEngine.stop('MUSIC');
  else if (event.type === 'MUSIC_PAUSE') audioEngine.pause('MUSIC');
  else if (event.type === 'MUSIC_RESUME') audioEngine.resume('MUSIC');
  else if (event.type === 'AUDIO_STOP_ALL') audioEngine.stop();
  else if (event.type === 'AUDIO_MUTE') audioEngine.mute(event.muted ?? false);
  else if (event.type === 'AUDIO_VOLUME') { audioEngine.setMasterVolume(event.master, event.fadeMs); audioEngine.setVoiceVolume(event.voice, event.fadeMs); audioEngine.setMusicVolume(event.music, event.fadeMs); }
  else if (event.type === 'AUDIO_DEVICE') { const success=await audioEngine.setOutputDevice(event.deviceId);if(event.requestId)window.desktop.ackAudioDevice(event.requestId,success); }
}

export async function playDiagnosticClip(channel:'VOICE'|'MUSIC',sourceId:string,url:string,durationMs:number,monitorMs=durationMs,onStarted?:(latencyMs:number)=>void):Promise<boolean>{const id=`diagnostic:${sourceId}`;const startedAt=performance.now();const started=await audioEngine.play(channel,id,url,durationMs,false);if(!started)return false;const stateAtStart=audioEngine.getState(channel);if(stateAtStart.sourceId===id&&stateAtStart.state==='PLAYING')onStarted?.(Math.max(0,performance.now()-startedAt));await new Promise(resolve=>setTimeout(resolve,Math.max(100,monitorMs)));const state=audioEngine.getState(channel);const progressed=state.sourceId===id&&(state.positionMs>100||state.state==='STOPPED'&&state.durationMs!==null&&state.positionMs>=Math.min(state.durationMs*0.7,monitorMs*0.7));audioEngine.stop(channel);return progressed;}
export async function startDiagnosticMusic(sourceId:string,url:string,durationMs:number):Promise<{started:boolean;stillPlaying():boolean;stop():void}>{const id=`diagnostic:${sourceId}`;const started=await audioEngine.play('MUSIC',id,url,durationMs,true);return{started,stillPlaying:()=>audioEngine.getState('MUSIC').sourceId===id&&audioEngine.getState('MUSIC').state==='PLAYING'&&audioEngine.getState('MUSIC').positionMs>100,stop:()=>{if(audioEngine.getState('MUSIC').sourceId===id)audioEngine.stop('MUSIC')}};}
export function createDiagnosticToneUrl(durationMs=850,sampleRate=22050):string{const samples=Math.floor(durationMs*sampleRate/1000);const bytes=new Uint8Array(44+samples*2);const v=new DataView(bytes.buffer);const ascii=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)bytes[offset+i]=value.charCodeAt(i)};ascii(0,'RIFF');v.setUint32(4,bytes.length-8,true);ascii(8,'WAVE');ascii(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);ascii(36,'data');v.setUint32(40,samples*2,true);for(let i=0;i<samples;i++){const fade=Math.min(1,i/(sampleRate*.02),(samples-i)/(sampleRate*.03));v.setInt16(44+i*2,Math.round(Math.sin(2*Math.PI*440*i/sampleRate)*.16*fade*32767),true)}let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return`data:audio/wav;base64,${btoa(binary)}`;}
