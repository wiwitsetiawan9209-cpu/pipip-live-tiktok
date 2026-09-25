import type {AvatarExpression} from './types.js';
export class ExpressionEngine {normalize(expression:AvatarExpression|undefined):AvatarExpression{return expression??'neutral'} safeNeutral():AvatarExpression{return'neutral'}}
