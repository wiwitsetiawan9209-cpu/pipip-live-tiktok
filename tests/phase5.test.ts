import { afterAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ContentBuffer, ContinuityEngine, ContinuityWatchdog, DeadAirMonitor, DEFAULT_CONTINUITY_THRESHOLDS,
  FallbackManager, InterruptPolicy, LiveShowDirector, NextActionQueue, RadioMode, RecoveryManager,
  ShowClock, TimeAwarenessService, TopicTransitionEngine, periodForHour,
} from '../packages/live-continuity/src/index.js';
import type { DirectorContext, ShowAction } from '../packages/live-continuity/src/index.js';
import {
  BackgroundMusicLoop, DuckingController, LyricsManager, LocalMusicFileProvider, MusicDirector,
  MusicLibrary, MusicPlayer, MusicSegment, MusicShowRuntime, MusicWatchdog, PlaylistManager,
  SongKnowledgeAnalyzer,
} from '../packages/music-engine/src/index.js';
import type { MusicConfig, MusicTrack } from '../packages/music-engine/src/index.js';
import { HostContextSchema } from '../packages/protocol/src/index.js';

const makeAction = (id: string, priority = 1, now = 1): ShowAction => ({ id, type: 'SPEAK', priority, createdAt: now, expiresAt: now + 1000 });
const track = (id: string, category: MusicTrack['category'] = 'FULL_SONG', durationMs: number | null = 10_000): MusicTrack => ({
  id, title: `Track ${id}`, artist: null, filePath: `C:/music/${id}.mp3`, durationMs,
  category, genre: null, mood: [], themes: [], lyricsId: null, enabled: true,
});
const config: MusicConfig = { backgroundMusicLevel: 0.6, musicDuringSpeech: 0.1, fadeDurationMs: 100, fullSongEnabled: true, loopBackground: true, maxRetries: 2, watchdogGraceMs: 5000 };
const directorContext = (overrides: Partial<DirectorContext> = {}): DirectorContext => ({
  now: 200_000, activity: 'WAIT', recentActivities: [], recentTopics: [], recentProducts: [], pendingAudience: 0,
  pendingActions: 0, availableProductIds: [], musicAvailable: false, musicPlaying: false, lastMusicAt: null,
  sessionDurationMs: 200_000, timePeriod: 'EVENING', personality: 'balanced', paused: false, humanTakeover: false,
  stopped: false, afterSongPending: false, ...overrides,
});
const showInput = (now: number, overrides: Partial<Parameters<MusicShowRuntime['advance']>[0]> = {}) => ({
  now, sessionStartedAt: 0, sessionDurationMs: now, greeted: true, pendingAudience: 0, availableProductIds: [],
  currentTopic: 'demo', personality: 'balanced', paused: false, humanTakeover: false, stopped: false, ...overrides,
});
const tempDirs: string[] = [];
afterAll(async () => { await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true }))); });

describe('Phase 5 time, clock, and show director', () => {
  it.each([[0, 'NIGHT'], [4, 'NIGHT'], [5, 'MORNING'], [10, 'MORNING'], [11, 'DAY'], [14, 'DAY'], [15, 'AFTERNOON'], [17, 'AFTERNOON'], [18, 'EVENING'], [22, 'EVENING'], [23, 'NIGHT'], [24, 'NIGHT']] as const)('maps hour %i to %s', (hour, period) => expect(periodForHour(hour)).toBe(period));
  it('normalizes negative hours into the day', () => expect(periodForHour(-1)).toBe('NIGHT'));
  it('uses injected clock and timezone for snapshots', () => {
    const service = new TimeAwarenessService('Asia/Jakarta', () => Date.parse('2026-09-25T00:05:00Z'));
    expect(service.snapshot(1000)).toMatchObject({ date: '2026-09-25', time: '07:05', timezone: 'Asia/Jakarta', period: 'MORNING', sessionStartedAt: 1000, sessionDurationMs: Date.parse('2026-09-25T00:05:00Z') - 1000 });
  });
  it('accepts structured runtime time in the strict host music context', () => {
    const result = HostContextSchema.safeParse({ sessionId: 'session-1', recentConversation: [], humanHostPresent: false, musicContext: { activity: 'MUSIC_INTRO', trackId: 'track-1', title: 'Local file', mood: [], themes: [], talkingPoints: [], date: '2026-09-25', dayOfWeek: 'Friday', time: '07:05', timezone: 'Asia/Jakarta', timePeriod: 'MORNING', sessionDurationMs: 5000 } });
    expect(result.success).toBe(true);
    expect(HostContextSchema.safeParse({ sessionId: 'session-1', recentConversation: [], humanHostPresent: false, showContext: { activity: 'STORY', date: 'not-a-date', dayOfWeek: 'Friday', time: '07:05', timezone: 'Asia/Jakarta', timePeriod: 'MORNING', sessionDurationMs: 0, reason: 'continuity' } }).success).toBe(false);
  });
  it('records bounded show history and duration', () => {
    let now = 100; const clock = new ShowClock(() => now, 2); clock.startSession(); now = 150; clock.record('PRODUCT_INTRO', now, { productId: 'p1' }); now = 200; clock.record('MUSIC_SEGMENT');
    expect(clock.getDuration()).toBe(100); expect(clock.getActivity()).toBe('MUSIC_SEGMENT'); expect(clock.recent()).toHaveLength(2); expect(clock.recent(2)[0]).toMatchObject({ activity: 'PRODUCT_INTRO', productId: 'p1' });
  });
  it('prioritizes urgent show opportunities in deterministic order', () => {
    const director = new LiveShowDirector();
    expect(director.selectNext(directorContext({ pendingAudience: 2, musicAvailable: true })).type).toBe('AUDIENCE');
    expect(director.selectNext(directorContext({ afterSongPending: true, pendingAudience: 2 })).type).toBe('AFTER_SONG');
    expect(director.selectNext(directorContext({ musicAvailable: true })).type).toBe('MUSIC');
    expect(director.selectNext(directorContext({ availableProductIds: ['p1'] })).productId).toBe('p1');
    expect(director.selectNext(directorContext()).type).toBe('STORY');
  });
  it.each([{ paused: true }, { stopped: true }, { humanTakeover: true }])('respects operator control state %o', state => expect(new LiveShowDirector().selectNext(directorContext(state)).type).toBe('WAIT'));
  it('does not schedule music before pacing threshold or during an active segment', () => {
    const director = new LiveShowDirector();
    expect(director.selectNext(directorContext({ sessionDurationMs: 60_000, musicAvailable: true })).type).not.toBe('MUSIC');
    expect(director.selectNext(directorContext({ musicAvailable: true, musicPlaying: true })).reason).toBe('music_segment_active');
  });
});

describe('Phase 5 queues, content validation, and continuity', () => {
  it('orders queue actions by priority and FIFO, rejects duplicates, and expires stale entries', () => {
    let now = 10; const queue = new NextActionQueue(3, () => now);
    expect(queue.enqueue({ ...makeAction('low', 1, now), topic: 'low' })).toBe(true); expect(queue.enqueue({ ...makeAction('high-a', 8, now), topic: 'high' })).toBe(true);
    expect(queue.enqueue({ ...makeAction('high-b', 8, now), topic: 'high' })).toBe(false); // same action key is deduplicated
    expect(queue.pop()?.id).toBe('high-a'); now = 2000; expect(queue.size).toBe(0);
  });
  it('honors capacity and pause, takeover, and stop gates', () => {
    const q = new NextActionQueue(1, () => 0); q.enqueue({ ...makeAction('one', 1, 0), expiresAt: 500 });
    expect(q.enqueue({ ...makeAction('two', 1, 0), expiresAt: 500 })).toBe(false); q.setPaused(true); expect(q.pop()).toBeUndefined(); q.setPaused(false); q.setHumanTakeover(true); expect(q.pop()).toBeUndefined(); q.stop(); expect(q.size).toBe(0); q.resume(); expect(q.enqueue({ ...makeAction('three', 1, 0), expiresAt: 500 })).toBe(true);
  });
  it('requires verified provenance for product, music, and knowledge opportunities', () => {
    let now = 10; const b = new ContentBuffer(4, () => now); const base = { createdAt: 0, expiresAt: 100, actionType: 'SPEAK' as const };
    expect(b.add({ ...base, id: 'bad-product', category: 'PRODUCT_BENEFIT', source: 'system' })).toBe(false);
    expect(b.add({ ...base, id: 'product', category: 'PRODUCT_BENEFIT', productId: 'p1', source: 'product-engine' })).toBe(true);
    expect(b.add({ ...base, id: 'bad-music', category: 'MUSIC', source: 'system' })).toBe(false);
    expect(b.add({ ...base, id: 'music', category: 'MUSIC', trackId: 't1', source: 'music-library' })).toBe(true);
    expect(b.add({ ...base, id: 'bad-topic', category: 'TOPIC', knowledgeTopic: 'policy', source: 'system' })).toBe(false);
    now = 100; expect(b.list()).toHaveLength(0);
  });
  it('reports dead air thresholds and exemptions', () => {
    const monitor = new DeadAirMonitor(); const base = { now: 100_000, lastHostSpeechAt: 0, lastAudienceEventAt: 0, activity: 'WAIT' as const, musicPlaying: false, speechInProgress: false, hostExpectedToSpeak: true, awaitingAudience: false, paused: false, stopped: false, humanTakeover: false };
    for (const [quiet, expected] of [[14_999, 'NORMAL'], [15_000, 'PREPARING'], [30_000, 'WARNING'], [45_000, 'INTERVENTION_REQUIRED'], [60_000, 'EMERGENCY']] as const) expect(monitor.getDeadAirStatus({ ...base, now: quiet })).toBe(expected);
    expect(monitor.getDeadAirStatus({ ...base, paused: true })).toBe('EXEMPT_PAUSED'); expect(monitor.getDeadAirStatus({ ...base, humanTakeover: true })).toBe('EXEMPT_HUMAN_TAKEOVER');
    expect(monitor.getDeadAirStatus({ ...base, activity: 'MUSIC_SEGMENT', musicPlaying: true })).toBe('EXEMPT_MUSIC'); expect(monitor.getDeadAirStatus({ ...base, awaitingAudience: true })).toBe('NORMAL');
  });
  it('maps topic transitions to contextual bridge intents', () => {
    const engine = new TopicTransitionEngine(); expect(engine.create('PRODUCT', 'MUSIC').intent).toBe('bridge_to_music'); expect(engine.create('AFTER_SONG', 'PRODUCT').intent).toBe('resume_after_song'); expect(engine.create('MUSIC', 'TOPIC').intent).toBe('return_to_previous_topic'); expect(engine.create('other', 'thing', 'reason').reason).toBe('reason');
  });
  it('starts, pauses, records, resumes, and stops one continuity session', () => {
    let now = 100; const engine = new ContinuityEngine({ now: () => now }); engine.start(); engine.recordActivity('GREETING'); now = 250;
    expect(engine.timeAwareness().sessionDurationMs).toBe(150); expect(engine.clock.getActivity()).toBe('GREETING'); engine.pause(true); expect(engine.next(directorContext())).toBeUndefined(); engine.pause(false); engine.humanTakeover(true); expect(engine.prepare(directorContext())).toBeUndefined(); engine.humanTakeover(false); engine.stop(); expect(engine.clock.getActivity()).toBe('WAIT'); expect(engine.content.list()).toHaveLength(0);
  });
  it('bounds repeated continuity failures and recovers through fallbacks', async () => {
    const watchdog = new ContinuityWatchdog(2); expect(watchdog.observe('PROVIDER_FAILURE').emergency).toBe(false); expect(watchdog.observe('QUEUE_STALLED').emergency).toBe(true); watchdog.reset(); expect(watchdog.getFailureCount()).toBe(0);
    const recovery = new RecoveryManager(1); let attempts = 0; const result = await recovery.run(async (): Promise<string> => { attempts++; throw new Error('offline'); }, [async () => 'fallback']); expect(result).toMatchObject({ ok: true, value: 'fallback', recoveredBy: 'fallback' }); expect(attempts).toBe(2);
    expect(new FallbackManager(() => 42).create('provider unavailable', 'p1')).toMatchObject({ id: 'fallback-42', type: 'PRODUCT', productId: 'p1' });
  });
  it('supports radio mode and urgent-only interruption during a song', () => {
    const mode = new RadioMode(); expect(mode.isRadio()).toBe(false); mode.set('RADIO_MODE'); expect(mode.isRadio()).toBe(true);
    const p = new InterruptPolicy(); expect(p.decide('COMMENT', true)).toBe('QUEUE'); expect(p.decide('FOLLOW', true)).toBe('AGGREGATE'); expect(p.decide('URGENT_SAFETY', true)).toBe('INTERRUPT');
  });
});

describe('Phase 5 local music, knowledge, and playback simulation', () => {
  it('indexes tracks defensively, returns copies, and excludes disabled entries', () => {
    const lib = new MusicLibrary(); lib.upsert(track('a')); lib.upsert({ ...track('b'), enabled: false }); const read = lib.get('a')!; read.mood.push('mutated');
    expect(lib.list()).toHaveLength(1); expect(lib.get('a')?.mood).toEqual([]); expect(lib.removeFromIndex('a')).toBe(true); expect(lib.size).toBe(1);
  });
  it('plays, pauses, resumes, and finishes through a clock-driven simulator', () => {
    let now = 100; const events: string[] = []; const player = new MusicPlayer(() => now, event => events.push(event.type)); const t = track('full', 'FULL_SONG', 1000);
    expect(player.play(t)).toBe(true); now = 400; expect(player.pause()).toBe(true); now = 1000; expect(player.tick()).toBeUndefined(); expect(player.resume()).toBe(true); now = 1700; expect(player.tick()).toBe('MUSIC_FINISHED'); expect(events).toEqual(['MUSIC_STARTED', 'MUSIC_PAUSED', 'MUSIC_RESUMED', 'MUSIC_FINISHED']);
  });
  it('rejects unknown-duration songs for deterministic full-song playback', () => {
    const player = new MusicPlayer(() => 1); const segment = new MusicSegment(player); expect(segment.start(track('unknown', 'FULL_SONG', null))).toBe(false); expect(segment.start(track('background', 'BACKGROUND'))).toBe(false);
  });
  it('selects only eligible full-song tracks and loops background playlists without immediate repeats', () => {
    const lib = new MusicLibrary(); lib.replace([track('a'), track('b'), track('unknown', 'FULL_SONG', null), track('bg', 'BACKGROUND')]);
    const director = new MusicDirector(lib); expect(director.choose('show_pacing')?.track.durationMs).toBe(10_000);
    const playlist = new PlaylistManager(lib, 'FULL_SONG'); const first = playlist.next()!; const second = playlist.next()!; expect(second.id).not.toBe(first.id);
  });
  it('ducks voice and clamps music level to the configured speech ceiling', () => {
    let now = 0; const duck = new DuckingController(config, () => now); duck.fadeMusicIn(); now = 100; expect(duck.getState().musicLevel).toBe(0.6); duck.duckForVoice(); now = 200; expect(duck.getState().musicLevel).toBe(0.1); duck.setMusicLevel(0.8); now = 300; expect(duck.getState().targetMusicLevel).toBe(0.1); duck.restoreMusic(); now = 400; expect(duck.getState().musicLevel).toBe(0.6);
  });
  it('retries music a bounded number of times, then selects a fallback or returns to host', () => {
    const lib = new MusicLibrary(); lib.replace([track('full'), track('bg', 'BACKGROUND')]); const watchdog = new MusicWatchdog(lib, 1);
    expect(watchdog.recover('full', 'PLAYBACK_FAILED').action).toBe('RETRY'); expect(watchdog.recover('full', 'PLAYBACK_FAILED').action).toBe('FALLBACK_TRACK');
    const empty = new MusicWatchdog(new MusicLibrary(), 0); expect(empty.recover('missing', 'UNAVAILABLE')).toMatchObject({ ok: false, action: 'RETURN_TO_HOST' });
  });
  it('loops configured background tracks and ducks them for speech', () => {
    let now = 0; const lib = new MusicLibrary(); lib.replace([track('bg-a', 'BACKGROUND', 100), track('bg-b', 'BACKGROUND', 100)]); const duck = new DuckingController(config, () => now); const loop = new BackgroundMusicLoop(lib, new MusicPlayer(() => now), config, duck);
    expect(loop.start()).toBe(true); expect(loop.getCurrentTrack()).toBeDefined(); loop.speechStarted(); now = 100; expect(duck.getState().targetMusicLevel).toBe(0.1); now = 101; expect(loop.tick()).toBe('MUSIC_STARTED'); loop.stop(); expect(loop.getState()?.playbackState).toBe('IDLE');
  });
  it('uses known local metadata and returns unknown when song facts are missing', async () => {
    const analyzer = new SongKnowledgeAnalyzer(); expect((await analyzer.analyze(track('unknown'))).source).toBe('unknown');
    const known = { ...track('known'), themes: ['hope'], mood: ['calm'] }; expect(await analyzer.analyze(known)).toMatchObject({ source: 'metadata', themes: ['hope'], mood: 'calm', confidence: 0.55 });
  });
  it('loads lyrics only from configured authorized local files and bounds analysis text', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pipip-phase5-lyrics-')); tempDirs.push(dir); await writeFile(path.join(dir, 'song-1.txt'), 'authorized lyrics'); await writeFile(path.join(dir, 'ignored.md'), 'ignored');
    const manager = new LyricsManager(dir, 100); expect((await manager.listLocalIds())).toEqual(['song-1']); expect((await manager.loadLocal(['song-1', '../ignored'])).map(x => x.songId)).toEqual(['song-1']); expect(manager.analysisText('song-1', 5)).toBe('autho'); expect(manager.addUserProvided({ songId: 'big', lyrics: 'x'.repeat(101), language: null, source: 'user-provided', updatedAt: '' })).toBe(false);
  });
  it('accepts an optional expert interpretation only as bounded, labeled background', async () => {
    const expert = { id: 'gemini', available: true, async answer() { return { provider: 'gemini', text: JSON.stringify({ themes: ['resilience'], summary: 'A cautious interpretation', confidence: 0.9 }), sources: [], confidence: 0.4, retrievedAt: '' }; } };
    const result = await new SongKnowledgeAnalyzer(expert).analyze(track('song'), 'user-provided words'); expect(result).toMatchObject({ source: 'external-advisor', themes: ['resilience'], confidence: 0.7 });
    const broken = { ...expert, async answer() { throw new Error('offline'); } }; expect((await new SongKnowledgeAnalyzer(broken).analyze(track('song'), 'lyrics')).source).toBe('unknown');
  });
});

describe('Phase 5 local scanner and continuous song flow', () => {
  it('scans local files, estimates WAV duration from its header, deduplicates content, and ignores unsupported files', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pipip-phase5-music-')); tempDirs.push(dir); await mkdir(path.join(dir, 'full-song'));
    const wav = Buffer.alloc(44 + 8000); wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(8000, 40);
    await writeFile(path.join(dir, 'full-song', 'tone.wav'), wav); await writeFile(path.join(dir, 'full-song', 'duplicate.wav'), wav); await writeFile(path.join(dir, 'full-song', 'notes.txt'), 'ignore');
    const result = await new LocalMusicFileProvider({ directories: [dir] }).scan(); expect(result.tracks).toHaveLength(1); expect(result.tracks[0]).toMatchObject({ category: 'FULL_SONG', durationMs: 1000 }); expect(['tone', 'duplicate']).toContain(result.tracks[0]?.title); expect(result.tracks[0]?.artist).toBeNull(); expect(result.duplicates).toHaveLength(1);
  });
  it('uses injected metadata when available and leaves unavailable fields unknown', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pipip-phase5-tags-')); tempDirs.push(dir); await writeFile(path.join(dir, 'file.wav'), 'not a valid wav');
    const result = await new LocalMusicFileProvider({ directories: [dir] }, { async read() { return { title: 'Tagged', artist: 'Known Artist', durationMs: 1234 }; } }).scan();
    expect(result.tracks[0]).toMatchObject({ title: 'Tagged', artist: 'Known Artist', durationMs: 1234 });
  });
  it('marks MP3 frame-based duration as an estimate', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pipip-phase5-mp3-')); tempDirs.push(dir); const bytes = Buffer.alloc(16_000); bytes.writeUInt32BE(0xfffb9000, 0); await writeFile(path.join(dir, 'estimate.mp3'), bytes);
    const result = await new LocalMusicFileProvider({ directories: [dir] }).scan(); expect(result.tracks[0]).toMatchObject({ durationMs: 1000, durationEstimated: true });
  });
  it('generates music intro and after-song contexts around deterministic playback state', async () => {
    let now = 1000; const lib = new MusicLibrary(); lib.upsert(track('song', 'FULL_SONG', 5000)); const player = new MusicPlayer(() => now); const segment = new MusicSegment(player);
    const runtime = new MusicShowRuntime(lib, segment, new LyricsManager(), new SongKnowledgeAnalyzer(), 'Asia/Jakarta', undefined, config, () => now); runtime.start(); runtime.requestMusic('song');
    const intro = await runtime.advance(showInput(now)); expect(intro.kind).toBe('HOST'); if (intro.kind !== 'HOST') return; expect(intro.action).toBe('MUSIC_INTRO'); expect(intro.time.timezone).toBe('Asia/Jakarta'); expect(intro.time.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(intro.time.time).toMatch(/^\d{2}:\d{2}$/); expect(intro.knowledge?.source).toBe('unknown'); expect(await runtime.complete(intro, false)).toBe(true);
    expect((await runtime.advance(showInput(now))).kind).toBe('MUSIC_PLAYING'); expect(runtime.finishAudioPlayback('wrong-track')).toBe(false); expect(runtime.finishAudioPlayback('song')).toBe(true); expect(runtime.finishAudioPlayback('song')).toBe(false);
    const after = await runtime.advance(showInput(now, { pendingAudience: 2 })); expect(after.kind).toBe('HOST'); if (after.kind !== 'HOST') return; expect(after.action).toBe('AFTER_SONG'); expect(after.nextActivity).toBe('AUDIENCE_INTERACTION'); expect(after.audienceSummary).toBe('2 audience interaction(s) queued'); expect(await runtime.complete(after, true)).toBe(true);
  });
  it('keeps unmeasured tracks out of automatic music selection while honoring playback gates', async () => {
    const lib = new MusicLibrary(); lib.upsert(track('unknown', 'FULL_SONG', null)); const runtime = new MusicShowRuntime(lib, new MusicSegment(new MusicPlayer()), new LyricsManager(), new SongKnowledgeAnalyzer(), 'Asia/Jakarta', undefined, config);
    runtime.start(); expect((await runtime.advance(showInput(Date.now()))).kind).toBe('NONE'); expect((await runtime.advance(showInput(Date.now(), { paused: true }))).kind).toBe('NONE');
  });
});
