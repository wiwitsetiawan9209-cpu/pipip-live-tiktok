import type {HostResponse} from '../../shared-types/src/index.js';
import type {AvatarEmotion,AvatarExpression} from './types.js';
export interface EmotionMapping {emotion:AvatarEmotion;expression:AvatarExpression;intensity:number}
export class EmotionEngine {
  map(response:HostResponse,personalityId='default-personality'):EmotionMapping {
    if(personalityId==='funny')return{emotion:response.emotion==='serious'?'friendly':'happy',expression:'big_smile',intensity:.72};
    if(personalityId==='energetic')return{emotion:'excited',expression:'big_smile',intensity:.88};
    if(personalityId==='expert')return response.emotion==='serious'?{emotion:'serious',expression:'serious',intensity:.55}:{emotion:'friendly',expression:'smile',intensity:.48};
    if(personalityId==='friendly')return{emotion:'friendly',expression:'smile',intensity:.58};
    const values:Record<HostResponse['emotion'],EmotionMapping>={neutral:{emotion:'neutral',expression:'neutral',intensity:.35},friendly:{emotion:'friendly',expression:'smile',intensity:.52},excited:{emotion:'excited',expression:'big_smile',intensity:.82},happy:{emotion:'happy',expression:'big_smile',intensity:.72},curious:{emotion:'thinking',expression:'thinking',intensity:.55},surprised:{emotion:'surprised',expression:'surprised',intensity:.7},serious:{emotion:'serious',expression:'serious',intensity:.55},playful:{emotion:'happy',expression:'smile',intensity:.66}};
    return {...values[response.emotion]};
  }
}
