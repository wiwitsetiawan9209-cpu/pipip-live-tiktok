import type {TikTokConnectionState} from '../types.js';
export interface ConnectorHealth {state:TikTokConnectionState;configured:boolean;secureStorageAvailable:boolean;lastValidatedAt:number|null;errorCount:number;lastErrorCode:string|null;timestamp:number}
