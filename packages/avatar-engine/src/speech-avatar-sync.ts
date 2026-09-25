import type {AvatarEngine} from './avatar-engine.js';
export class SpeechAvatarSync {constructor(private readonly avatar:AvatarEngine){}started(text:string){return this.avatar.speechStarted(text)}paused(){return this.avatar.speechPaused()}resumed(){return this.avatar.speechResumed()}ended(){return this.avatar.speechEnded()}failed(){return this.avatar.speechEnded(true)}}
