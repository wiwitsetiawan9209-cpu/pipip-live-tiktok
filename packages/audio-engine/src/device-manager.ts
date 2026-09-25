import type { AudioDeviceInfo, AudioDeviceProvider } from './types.js';
export class AudioDeviceManager {
  private selected = 'default';
  constructor(private readonly provider: AudioDeviceProvider) {}
  async list(): Promise<AudioDeviceInfo[]> { return this.provider.list(); }
  async select(id: string) { const devices = await this.provider.list(); if (!devices.some(x => x.id === id && x.available)) return false; if (!(await this.provider.set(id))) return false; this.selected = id; return true; }
  getSelected() { return this.selected; }
}
export class DefaultAudioDeviceProvider implements AudioDeviceProvider {
  async list() { return [{ id: 'default', label: 'System default output', isDefault: true, available: true }]; }
  async set(deviceId: string) { return deviceId === 'default'; }
}
export class ReportedAudioDeviceProvider implements AudioDeviceProvider {
  private devices:AudioDeviceInfo[]=[{id:'default',label:'System default output',isDefault:true,available:true}];private selected='default';
  update(devices:AudioDeviceInfo[]){const unique=new Map<string,AudioDeviceInfo>();for(const d of devices){if(typeof d.id!=='string'||d.id.length<1||d.id.length>300||!/^[-\w/=+:.]+$/u.test(d.id)||typeof d.label!=='string')continue;unique.set(d.id,{id:d.id,label:d.label.trim().slice(0,120)||'Audio output',isDefault:d.isDefault===true,available:d.available===true})}if(!unique.has('default'))unique.set('default',{id:'default',label:'System default output',isDefault:true,available:true});this.devices=[...unique.values()].map(d=>({...d,isDefault:d.id==='default'||d.isDefault}));}
  async list(){return this.devices.map(d=>({...d}));}
  async set(deviceId:string){if(!this.devices.some(d=>d.id===deviceId&&d.available))return false;this.selected=deviceId;return true;}
  getSelected(){return this.selected;}
}
