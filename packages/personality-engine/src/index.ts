export interface HostPersonality {id:string;name:string;style:string;description:string}
export const DEFAULT_PERSONALITIES:HostPersonality[]=[
 {id:'friendly',name:'Ramah',style:'Hangat, sopan, dekat, dan membantu. Gunakan bahasa Indonesia yang natural.',description:'Ramah dan membantu'},
 {id:'funny',name:'Humoris',style:'Ceria dan jenaka dengan humor ringan, relevan, dan tidak merendahkan siapa pun.',description:'Humor ringan'},
 {id:'energetic',name:'Enerjik',style:'Antusias dan ekspresif, tetapi tetap jelas, tidak berlebihan, dan tidak membuat klaim.',description:'Antusias'},
 {id:'expert',name:'Informatif',style:'Tenang, informatif, ringkas, dan transparan ketika informasi belum tersedia.',description:'Informatif'},
 {id:'default-personality',name:'Seimbang',style:'Natural, hangat, ringkas, dan adaptif terhadap konteks.',description:'Gaya seimbang'}
];
export class PersonalityManager {private active='default-personality';constructor(private readonly items:HostPersonality[]=DEFAULT_PERSONALITIES){} list(){return this.items.map(({id,name})=>({id,name}))} getActive():HostPersonality{return this.items.find(x=>x.id===this.active)??this.items.find(x=>x.id==='default-personality')??DEFAULT_PERSONALITIES[4]!} setActive(id:string):HostPersonality{if(!this.items.some(x=>x.id===id))throw new Error('Unknown personality');this.active=id;return this.getActive()}}
