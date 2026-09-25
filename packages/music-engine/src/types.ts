export type MusicCategory='BACKGROUND'|'FULL_SONG'|'TRANSITION'|'EMERGENCY';
export type PlaybackState='IDLE'|'PLAYING'|'PAUSED'|'FINISHED'|'ERROR';
export interface MusicTrack {id:string;title:string;artist:string|null;filePath:string;durationMs:number|null;durationEstimated?:boolean;category:MusicCategory;genre:string|null;mood:string[];themes:string[];lyricsId:string|null;enabled:boolean;sizeBytes?:number;contentHash?:string}
export interface MusicLibraryConfig {directories:string[];lyricsDirectory?:string;extensions?:string[];maxFileBytes?:number}
export interface MusicPlayback {trackId:string;title:string;artist:string|null;positionMs:number;durationMs:number|null;startedAt:number;expectedEnd:number|null;playbackState:PlaybackState;mode:'BACKGROUND'|'FULL_TRACK';error?:string}
export interface SongKnowledge {songId:string;themes:string[];mood:string|null;emotionalTone:string|null;summary:string|null;talkingPoints:string[];confidence:number;source:'metadata'|'lyrics-local'|'external-advisor'|'unknown';sourceInfo:string|null}
export interface LyricsRecord {songId:string;lyrics:string;language:string|null;source:'user-provided'|'authorized-local';updatedAt:string}
export interface SongIntroContext {track:MusicTrack;knowledge:SongKnowledge|null;timePeriod:string;personality:string;previousTopic:string|null;reason:string}
export interface AfterSongContext {track:MusicTrack;knowledge:SongKnowledge|null;audienceSummary:string|null;previousTopic:string|null;nextActivity:string|null}
export interface MusicConfig {backgroundMusicLevel:number;musicDuringSpeech:number;fadeDurationMs:number;fullSongEnabled:boolean;loopBackground:boolean;maxRetries:number;watchdogGraceMs:number;duckingEnabled?:boolean;attackMs?:number;releaseMs?:number;minimumMusicLevel?:number}
