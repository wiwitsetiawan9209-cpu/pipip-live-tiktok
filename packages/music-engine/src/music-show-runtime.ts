import type { DirectorContext, ShowActivity, TimeAwareness } from '../../live-continuity/src/index.js';
import { LiveShowDirector, TimeAwarenessService } from '../../live-continuity/src/index.js';
import type { MusicConfig, MusicPlayback, MusicTrack, SongKnowledge } from './types.js';
import { MusicDirector } from './music-director.js';
import { MusicLibrary } from './music-library.js';
import { MusicSegment } from './music-segment.js';
import { LyricsManager } from './lyrics-manager.js';
import { SongKnowledgeAnalyzer } from './song-knowledge.js';

export type MusicHostPlan = {
  kind: 'HOST'; action: 'MUSIC_INTRO' | 'AFTER_SONG'; track: MusicTrack;
  knowledge: SongKnowledge | null; time: TimeAwareness; previousTopic: string | null;
  reason: string; nextActivity: string | null; audienceSummary: string | null;
};
export type MusicAdvance = { kind: 'MUSIC_PLAYING'; playback: MusicPlayback } | MusicHostPlan | { kind: 'NONE' };
export interface MusicShowInput {
  now: number; sessionStartedAt: number; sessionDurationMs: number; greeted: boolean;
  pendingAudience: number; availableProductIds: string[]; currentTopic: string | null;
  personality: string; paused: boolean; humanTakeover: boolean; stopped: boolean;
}

export class MusicShowRuntime {
  private readonly director = new LiveShowDirector();
  private readonly musicDirector: MusicDirector;
  private readonly time: TimeAwarenessService;
  private currentTrack: MusicTrack | null = null;
  private currentKnowledge: SongKnowledge | null = null;
  private pending: 'MUSIC_INTRO' | 'AFTER_SONG' | null = null;
  private pendingPlan: MusicHostPlan | null = null;
  private afterSong = false;
  private lastMusicAt: number | null = null;
  private operatorRequest = false;
  private requestedTrackId: string | null = null;
  private activities: ShowActivity[] = [];

  constructor(
    private readonly library: MusicLibrary,
    private readonly segment: MusicSegment,
    private readonly lyrics: LyricsManager,
    private readonly knowledge: SongKnowledgeAnalyzer,
    timezone = 'Asia/Jakarta',
    private readonly onMusicFinished: (track: MusicTrack) => void = () => {},
    private readonly config?: MusicConfig,
    private readonly now = () => Date.now(),
  ) {
    this.musicDirector = new MusicDirector(library);
    this.time = new TimeAwarenessService(timezone, this.now);
  }

  start() { this.pending = null; this.pendingPlan = null; this.afterSong = false; this.operatorRequest = false; this.requestedTrackId = null; this.currentTrack = null; this.currentKnowledge = null; this.activities = []; }
  requestMusic(trackId?: string) { this.operatorRequest = true; this.requestedTrackId = trackId ?? null; }
  getLastMusicAt() { return this.lastMusicAt; }
  getPlaybackState() { return this.segment.getState(); }
  finishAudioPlayback(trackId: string) { if (!this.currentTrack || this.currentTrack.id !== trackId || !this.segment.finish(trackId)) return false; this.afterSong = true; this.activities.push('MUSIC_SEGMENT'); this.activities = this.activities.slice(-20); this.onMusicFinished(this.currentTrack); return true; }

  async advance(input: MusicShowInput): Promise<MusicAdvance> {
    const playback = this.segment.getState();
    if (playback?.playbackState === 'PLAYING') {
      if (this.segment.tick() === 'MUSIC_FINISHED' && this.currentTrack) {
        this.afterSong = true;
        this.activities.push('MUSIC_SEGMENT');
        this.activities = this.activities.slice(-20);
        this.onMusicFinished(this.currentTrack);
      }
      const current = this.segment.getState();
      if (current?.playbackState === 'PLAYING') return { kind: 'MUSIC_PLAYING', playback: current };
    }
    if (this.pendingPlan) return this.pendingPlan;
    if (this.afterSong && this.currentTrack) {
      const next = this.director.selectNext(this.directorContext(input, true));
      if (next.type === 'AFTER_SONG') return this.createPlan('AFTER_SONG', input);
    }
    if (!input.greeted || input.paused || input.humanTakeover || input.stopped || this.config?.fullSongEnabled === false) return { kind: 'NONE' };
    const musicAvailable = this.library.list('FULL_SONG').some(t => t.durationMs !== null && t.durationMs > 0);
    const next = this.director.selectNext({ ...this.directorContext(input, false), musicAvailable });
    if (next.type !== 'MUSIC' && !this.operatorRequest) return { kind: 'NONE' };
    const requested = this.requestedTrackId ? this.library.get(this.requestedTrackId) : undefined;
    const selected = this.requestedTrackId
      ? requested?.category === 'FULL_SONG' && requested.durationMs !== null && requested.durationMs > 0 ? { track: requested, reason: 'operator_request' as const } : undefined
      : this.musicDirector.choose(this.operatorRequest ? 'operator_request' : 'show_pacing');
    this.operatorRequest = false;
    this.requestedTrackId = null;
    if (!selected) return { kind: 'NONE' };
    this.currentTrack = selected.track;
    this.currentKnowledge = null;
    return this.createPlan('MUSIC_INTRO', input);
  }

  async complete(plan: MusicHostPlan, success: boolean) {
    if (this.pendingPlan?.track.id !== plan.track.id || this.pendingPlan.action !== plan.action) return false;
    this.pendingPlan = null;
    if (plan.action === 'MUSIC_INTRO') {
      this.pending = null;
      this.currentKnowledge = plan.knowledge;
      // Keep playback independent from host and optional analysis availability.
      const started = this.segment.start(plan.track);
      if (started) {
        this.currentTrack = plan.track;
        this.lastMusicAt = this.now();
        this.afterSong = false;
        this.activities.push('MUSIC_SEGMENT');
        this.activities = this.activities.slice(-20);
      }
      return started;
    }
    this.pending = null;
    this.afterSong = false;
    this.activities.push('AFTER_SONG');
    this.activities = this.activities.slice(-20);
    this.currentTrack = null;
    this.currentKnowledge = null;
    return success;
  }

  pause() { this.segment.pause(); }
  resume() { this.segment.resume(); }
  stop() { this.pending = null; this.pendingPlan = null; this.afterSong = false; this.operatorRequest = false; this.requestedTrackId = null; this.currentTrack = null; this.currentKnowledge = null; this.segment.stop(); }
  nextWakeDelay(now: number) { const p = this.segment.getState(); return p?.playbackState === 'PLAYING' && p.expectedEnd !== null ? Math.max(10, p.expectedEnd - now) : null; }

  private async createPlan(action: 'MUSIC_INTRO' | 'AFTER_SONG', input: MusicShowInput): Promise<MusicHostPlan> {
    const track = this.currentTrack!;
    if (action === 'MUSIC_INTRO') {
      const suppliedLyrics = this.lyrics.analysisText(track.lyricsId ?? track.id, 20_000);
      this.currentKnowledge = await this.knowledge.analyze(track, suppliedLyrics ?? undefined);
    }
    const plan: MusicHostPlan = {
      kind: 'HOST', action, track, knowledge: this.currentKnowledge, time: this.time.snapshot(input.sessionStartedAt),
      previousTopic: input.currentTopic, reason: action === 'MUSIC_INTRO' ? 'transition_after_product' : 'music_finished',
      nextActivity: action === 'AFTER_SONG' ? (input.availableProductIds.length ? 'PRODUCT_EDUCATION' : 'AUDIENCE_INTERACTION') : null,
      audienceSummary: action === 'AFTER_SONG' && input.pendingAudience > 0 ? `${input.pendingAudience} audience interaction(s) queued` : null,
    };
    this.pending = action;
    this.pendingPlan = plan;
    if (action === 'MUSIC_INTRO') this.activities.push('MUSIC_INTRO');
    this.activities = this.activities.slice(-20);
    return plan;
  }

  private directorContext(input: MusicShowInput, afterSong: boolean): DirectorContext {
    const playback = this.segment.getState();
    return {
      now: input.now, activity: playback?.playbackState === 'PLAYING' ? 'MUSIC_SEGMENT' : this.activities.at(-1) ?? 'WAIT',
      recentActivities: [...this.activities], recentTopics: input.currentTopic ? [input.currentTopic] : [], recentProducts: [],
      pendingAudience: input.pendingAudience, pendingActions: this.pending ? 1 : 0, availableProductIds: [...input.availableProductIds],
      musicAvailable: this.library.list('FULL_SONG').some(t => t.durationMs !== null && t.durationMs > 0), musicPlaying: playback?.playbackState === 'PLAYING',
      lastMusicAt: this.lastMusicAt, sessionDurationMs: input.sessionDurationMs, timePeriod: this.time.snapshot(input.sessionStartedAt).period,
      personality: input.personality, paused: input.paused, humanTakeover: input.humanTakeover, stopped: input.stopped,
      afterSongPending: afterSong, ...(this.operatorRequest ? { operatorRequest: 'MUSIC' as const } : {}),
    };
  }
}
