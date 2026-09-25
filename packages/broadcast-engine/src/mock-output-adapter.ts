import type { BroadcastOutputAdapter, BroadcastOutputState, BroadcastRenderState } from './types.js';
export class MockBroadcastOutputAdapter implements BroadcastOutputAdapter {
 readonly id='local-preview';private state:BroadcastOutputState={connected:false,available:true,error:null,lastRenderAt:null};private last:BroadcastRenderState|null=null;failNextRender=false;available=true;
 async isAvailable(){return this.available}
 async connect(){if(!this.available)throw new Error('Output unavailable');this.state={...this.state,connected:true,error:null}}
 async disconnect(){this.state={...this.state,connected:false}}
 async render(state:BroadcastRenderState){if(this.failNextRender){this.failNextRender=false;this.state={...this.state,error:'Preview render failed'};throw new Error('Preview render failed')}if(!this.state.connected)throw new Error('Output disconnected');this.last=structuredClone(state);this.state={...this.state,error:null,lastRenderAt:state.timestamp}}
 async clear(){this.last=null}
 async getState(){return{...this.state,available:this.available}}
 async emergencyStop(){this.last=null;this.state={...this.state,connected:false}}
 getLastRender(){return this.last?structuredClone(this.last):null}
}
