export type ShowMode='LIVE_SHOW'|'RADIO_MODE';
export class RadioMode {private mode:ShowMode='LIVE_SHOW';set(mode:ShowMode){this.mode=mode;return this.mode}get(){return this.mode}isRadio(){return this.mode==='RADIO_MODE'}}
