export type DiagnosticState='UNKNOWN'|'READY'|'FAILED';
export type AudioDiagnosticStep='tone'|'voice'|'music'|'ducking';
export interface AudioDiagnosticReport {timestamp:string;device:string;deviceDetected:boolean;softwarePlayback:boolean;voicePlayback:boolean;musicPlayback:boolean;duckingPlayback:boolean;humanConfirmed:boolean|null;playbackStartLatencyMs:number|null;status:{speaker:DiagnosticState;voice:DiagnosticState;music:DiagnosticState;ducking:DiagnosticState}}
export class AudioDiagnosticSession {
  private reportValue:AudioDiagnosticReport;
  constructor(device:string,deviceDetected:boolean,now=()=>new Date().toISOString()){this.reportValue={timestamp:now(),device:device.slice(0,120),deviceDetected,softwarePlayback:false,voicePlayback:false,musicPlayback:false,duckingPlayback:false,humanConfirmed:null,playbackStartLatencyMs:null,status:{speaker:'UNKNOWN',voice:'UNKNOWN',music:'UNKNOWN',ducking:'UNKNOWN'}}}
  markPlayback(step:AudioDiagnosticStep,success:boolean){if(step==='tone'){this.reportValue.softwarePlayback=success;return}if(step==='voice'){this.reportValue.voicePlayback=success;this.reportValue.status.voice=success?'READY':'FAILED';return}if(step==='music'){this.reportValue.musicPlayback=success;this.reportValue.status.music=success?'READY':'FAILED';return}this.reportValue.duckingPlayback=success;this.reportValue.status.ducking=success?'READY':'FAILED'}
  setPlaybackStartLatency(value:number|null){this.reportValue.playbackStartLatencyMs=value!==null&&Number.isFinite(value)&&value>=0?Math.round(value):null}
  confirmSpeaker(heard:boolean){this.reportValue.humanConfirmed=heard;this.reportValue.status.speaker=heard?'READY':'FAILED'}
  report():AudioDiagnosticReport{return JSON.parse(JSON.stringify(this.reportValue)) as AudioDiagnosticReport}
}
