import type { SceneId, SceneState } from './types.js';
const priority:Record<SceneId,number>={DEFAULT:0,WAITING:10,MUSIC:20,HOST_SPEAKING:30,PRODUCT:40,PRODUCT_FOCUS:50,ERROR:80,HUMAN_TAKEOVER:90,EMERGENCY:100};
const titles:Record<SceneId,string>={DEFAULT:'Default',PRODUCT:'Product',PRODUCT_FOCUS:'Product focus',HOST_SPEAKING:'Host speaking',MUSIC:'Music',WAITING:'Waiting',HUMAN_TAKEOVER:'Human takeover',EMERGENCY:'Emergency',ERROR:'Error'};
export class SceneManager {
 private current:SceneState; private stack:SceneState[]=[];
 constructor(private readonly now=()=>Date.now()){this.current=this.create('DEFAULT')}
 currentScene(){return structuredClone(this.current)}
 activate(id:SceneId,metadata:Record<string,string|number|boolean|null>={}){const next=this.create(id,metadata);if(priority[id]<priority[this.current.sceneId]&&id!=='DEFAULT')return false;if(id!==this.current.sceneId&&priority[id]>priority[this.current.sceneId]&&!['DEFAULT','WAITING','MUSIC','HOST_SPEAKING','PRODUCT','PRODUCT_FOCUS'].includes(id))this.stack.push(this.current);this.current=next;return true}
 restore(){while(this.stack.length){const previous=this.stack.pop()!;if(previous.sceneId!=='EMERGENCY'&&previous.sceneId!=='HUMAN_TAKEOVER'){this.current={...previous,active:true,startedAt:this.now()};return this.current.sceneId}}this.current=this.create('DEFAULT');return 'DEFAULT' as SceneId}
 clear(){this.stack=[];this.current=this.create('DEFAULT')}
 private create(id:SceneId,metadata:Record<string,string|number|boolean|null>={}):SceneState{return{sceneId:id,name:titles[id],active:true,priority:priority[id],startedAt:this.now(),durationMs:null,overlays:[],metadata:{...metadata}}}
}
