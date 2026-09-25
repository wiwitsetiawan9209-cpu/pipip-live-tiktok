import type {AvatarCommand} from './types.js';
export class AnimationSelector {select(command:AvatarCommand):AvatarCommand{return structuredClone(command)}}
