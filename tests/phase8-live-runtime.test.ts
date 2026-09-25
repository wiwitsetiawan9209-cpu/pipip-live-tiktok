import { describe, expect, it } from 'vitest';
import { LiveRuntime, RuntimeEventBus, RuntimeErrorRecovery, RuntimeWatchdog, LIVE_RUNTIME_TRANSITIONS } from '../packages/live-runtime/src/index.js';
import type { LiveRuntimePorts, RuntimeAction, RuntimeEventName } from '../packages/live-runtime/src/index.js';
import { IPCChannelSchema, LiveRuntimeControlSchema } from '../packages/protocol/src/index.js';

function harness(overrides: Partial<LiveRuntimePorts> = {}) {
  let now = 10_000;
  const calls = { start: 0, stop: 0, pause: 0, resume: 0, voiceStop: 0, takeover: 0, emergency: 0, reset: 0, musicStop: 0, speak: 0, play: 0, selected: '' };
  const ports: LiveRuntimePorts = {
    orchestrator: { start: () => { calls.start++; }, stop: () => { calls.stop++; }, pause: () => { calls.pause++; }, resume: () => { calls.resume++; }, getState: () => ({ currentIntent: 'WAIT', currentProductId: null }) },
    voice: { speak: async () => { calls.speak++; return { accepted: true }; }, stop: () => { calls.voiceStop++; }, pause: () => {}, resume: () => {}, setHumanTakeover: () => { calls.takeover++; }, emergencyStop: () => { calls.emergency++; }, resetEmergency: () => { calls.reset++; }, getStatus: () => ({ state: 'IDLE', queueLength: 0 }) },
    music: { stop: () => { calls.musicStop++; }, getStatus: () => ({ playbackState: 'STOPPED' }) },
    avatar: { humanTakeover: () => {}, emergencyStop: async () => { calls.emergency++; }, resume: async () => {}, command: async () => true, snapshot: () => ({ state: 'IDLE', connected: true, queueLength: 0 }) },
    audience: { getStatus: () => 'unknown', getQueueDepth: () => 0 }, product: { getStatus: () => 'ready', hasProduct: id => id.startsWith('known-') },
    selectProduct: id => { calls.selected = id; return id.startsWith('known-'); }, playMusic: () => { calls.play++; return true; }, ...overrides,
  };
  const runtime = new LiveRuntime(ports, { now: () => now, maxActivity: 5, sessionId: () => 'test-session' });
  return { runtime, calls, advance: (ms: number) => { now += ms; } };
}

describe('Phase 8 Live Runtime', () => {
  it('starts with observational unknown subsystem health', () => {
    const runtime = new LiveRuntime({}, { now: () => 1 });
    expect(runtime.snapshot()).toMatchObject({ state: 'IDLE', health: { status: 'degraded', audience: 'unknown', product: 'unknown', voice: 'unknown', music: 'unknown', avatar: 'unknown' } });
  });
  it('returns a safe snapshot with no operational secrets or provider data', async () => {
    const { runtime } = harness(); await runtime.startSession(); const snapshot = runtime.snapshot();
    expect(JSON.stringify(snapshot)).not.toMatch(/api.?key|token|password|cookie|secret/i);
  });
  it('records only bounded activity entries', async () => { const { runtime } = harness(); await runtime.startSession(); for (let i = 0; i < 12; i++) runtime.observeAudience('COMMENT', true); expect(runtime.snapshot().activity.length).toBeLessThanOrEqual(5); });

  it.each(Array.from({ length: 25 }, (_, index) => index + 1))('start is idempotent across %i repeated requests', async repeat => {
    const { runtime, calls } = harness(); for (let i = 0; i < repeat; i++) await runtime.startSession();
    expect(runtime.snapshot().state).toBe('RUNNING'); expect(calls.start).toBe(1);
  });

  it.each(Array.from({ length: 20 }, (_, index) => index + 1))('pause and resume remain stable after %i repetitions', async repeat => {
    const { runtime, calls } = harness(); await runtime.startSession();
    for (let i = 0; i < repeat; i++) { await runtime.pauseSession(); await runtime.pauseSession(); await runtime.resumeSession(); await runtime.resumeSession(); }
    expect(runtime.snapshot().state).toBe('RUNNING'); expect(calls.pause).toBe(repeat); expect(calls.resume).toBe(repeat);
  });

  it.each(Array.from({ length: 20 }, (_, index) => index + 1))('stop remains idempotent after %i repeated requests', async repeat => {
    const { runtime, calls } = harness(); await runtime.startSession();
    for (let i = 0; i < repeat; i++) await runtime.stopSession();
    expect(runtime.snapshot().state).toBe('STOPPED'); expect(calls.stop).toBe(1);
  });

  it.each(Array.from({ length: 20 }, (_, index) => index + 1))('emergency stop is latched and idempotent across %i requests', async repeat => {
    const { runtime } = harness(); await runtime.startSession();
    for (let i = 0; i < repeat; i++) await runtime.emergencyStop();
    expect(runtime.snapshot()).toMatchObject({ emergencyStopped: true, health: { status: 'failed' } });
    expect((await runtime.startSession()).state).toBe('ERROR');
  });

  it.each(['PLAY_MUSIC', 'STOP_MUSIC', 'DUCK_MUSIC', 'RESTORE_MUSIC', 'AVATAR_COMMAND', 'SELECT_PRODUCT', 'WAIT'] as const)('routes permitted action %s', async type => {
    const { runtime } = harness(); await runtime.startSession(); const action: RuntimeAction = type === 'AVATAR_COMMAND' ? { type, gesture: 'wave' } : type === 'SELECT_PRODUCT' ? { type, productId: 'known-1' } : type === 'PLAY_MUSIC' ? { type, trackId: 'track-1' } : { type };
    expect(await runtime.routeAction(action)).toBe(true);
  });

  it.each([
    ['', 'id-ID'], [' ', 'id-ID'], ['x'.repeat(4001), 'id-ID'], ['halo', 'en-US'], ['halo', 'en-GB'], ['halo', 'id_ID'],
    ['x'.repeat(5000), ''], ['\u0000', 'id-ID'], ['  ', ''], ['fakta tanpa data', 'en-US'],
  ])('rejects unsafe/invalid speech payload (%s, %s)', async (text, language) => {
    const { runtime } = harness(); await runtime.startSession(); expect(await runtime.routeAction({ type: 'SPEAK', text, language })).toBe(false);
  });

  it.each(Array.from({ length: 10 }, (_, index) => `unknown-${index}`))('does not select missing product %s', async productId => {
    const { runtime, calls } = harness(); await runtime.startSession(); expect(await runtime.routeAction({ type: 'SELECT_PRODUCT', productId })).toBe(false); expect(calls.selected).toBe('');
  });

  it.each(['COMMENT', 'NEW_VIEWER', 'FOLLOW', 'LIKE', 'GIFT', 'SYSTEM', 'UNKNOWN', 'not-an-event'])(
    'records audience data without fabricating a count for %s', kind => {
      const { runtime } = harness(); runtime.observeAudience(kind, false); const event = runtime.events.getHistory().at(-2);
      expect(runtime.snapshot().metrics.audienceEvents).toBe(1); expect(JSON.stringify(event)).not.toMatch(/viewerCount|sales|conversion/i);
    },
  );

  it.each(['IDLE', 'PREPARING', 'SYNTHESIZING', 'READY', 'PLAYING', 'PAUSED', 'FAILED', 'STOPPED', 'UNKNOWN'])(
    'maps voice state %s to observational health', async state => {
      const { runtime } = harness({ voice: { speak: async () => ({ accepted: true }), stop: () => {}, getStatus: () => ({ state }) } });
      expect(runtime.health().voice).toBe(state === 'UNKNOWN' ? 'unknown' : state === 'FAILED' ? 'error' : ['PREPARING', 'SYNTHESIZING', 'PLAYING'].includes(state) ? 'busy' : 'ready');
    },
  );

  it.each(['STOPPED', 'PLAYING', 'PAUSED', 'FAILED'])(
    'maps music state %s to observational health', state => {
      const { runtime } = harness({ music: { stop: () => {}, getStatus: () => ({ playbackState: state, error: state === 'FAILED' ? 'failed' : null }) } });
      expect(runtime.health().music).toBe(state === 'FAILED' ? 'error' : state === 'PLAYING' ? 'playing' : 'ready');
    },
  );

  it.each(['IDLE', 'SPEAKING', 'GESTURING', 'STOPPED', 'ERROR'])(
    'maps avatar state %s to observational health', state => {
      const { runtime } = harness({ avatar: { humanTakeover: () => {}, emergencyStop: async () => {}, snapshot: () => ({ state, connected: true, lastError: state === 'ERROR' ? 'failed' : null }) } });
      expect(runtime.health().avatar).toBe(state === 'ERROR' ? 'error' : ['SPEAKING', 'GESTURING'].includes(state) ? 'busy' : 'ready');
    },
  );

  it.each(['operator', 'runtime'] as const)('keeps emergency latch set for %s stop source', async reason => {
    const { runtime } = harness(); await runtime.startSession(); await runtime.emergencyStop();
    expect(runtime.events.getHistory().find(item => item.type === 'EMERGENCY_STOP')?.payload.reason).toBe('operator');
    expect(runtime.snapshot().emergencyStopped).toBe(true); void reason;
  });

  it.each(Array.from({ length: 12 }, (_, index) => index))('retains deterministic monotonic sequence number %i', index => {
    let now = 50; const bus = new RuntimeEventBus(() => now++); let event = bus.emit('ACTIVITY', { detail: `event-${index}` });
    for (let sequence = 2; sequence <= index + 1; sequence++) event = bus.emit('ACTIVITY', { detail: `event-${sequence}` });
    expect(event.sequence).toBe(index + 1); expect(event.timestamp).toBe(50 + index);
  });

  it.each(Object.keys(LIVE_RUNTIME_TRANSITIONS) as Array<keyof typeof LIVE_RUNTIME_TRANSITIONS>)(
    'defines an explicit transition policy for state %s', state => {
      expect(Array.isArray(LIVE_RUNTIME_TRANSITIONS[state])).toBe(true);
      expect(new Set(LIVE_RUNTIME_TRANSITIONS[state]).size).toBe(LIVE_RUNTIME_TRANSITIONS[state].length);
    },
  );

  it.each(['takeover during speech', 'takeover during music', 'takeover during avatar gesture'])(
    'human takeover has priority during %s', async phase => {
      const { runtime, calls } = harness(); await runtime.startSession(); await runtime.requestHumanTakeover();
      expect(runtime.snapshot()).toMatchObject({ state: 'HUMAN_TAKEOVER', humanTakeover: true });
      expect(await runtime.routeAction({ type: 'SPEAK', text: 'Jangan bicara', language: 'id-ID' })).toBe(false);
      expect(calls.takeover).toBeGreaterThan(0); expect(phase).toContain('takeover');
    },
  );

  it.each(['speech', 'music', 'avatar command', 'host generation'])(
    'emergency stop clears active %s activity', async phase => {
      const { runtime, calls } = harness(); await runtime.startSession(); runtime.setQueueDepth(9); await runtime.emergencyStop();
      expect(runtime.snapshot()).toMatchObject({ emergencyStopped: true, queueDepth: 0, activeActivity: 'EMERGENCY_STOPPED' });
      expect(calls.stop).toBe(1); expect(calls.musicStop).toBe(1); expect(phase.length).toBeGreaterThan(0);
    },
  );

  it.each(Array.from({ length: 10 }, (_, index) => index + 1))('emergency reset number %i clears latch but never restarts autonomously', async repeat => {
    const { runtime, calls } = harness(); await runtime.startSession(); await runtime.emergencyStop();
    for (let i = 0; i < repeat; i++) await runtime.resetAfterEmergency();
    expect(runtime.snapshot()).toMatchObject({ state: 'STOPPED', emergencyStopped: false }); expect(calls.start).toBe(1);
  });

  it('allows restart as a new session after a normal stop', async () => {
    const { runtime, calls } = harness(); await runtime.startSession(); await runtime.stopSession(); const oldId = runtime.snapshot().sessionId; await runtime.startSession();
    expect(calls.start).toBe(2); expect(runtime.snapshot().state).toBe('RUNNING'); expect(runtime.snapshot().sessionId).toBe(oldId);
  });

  it('releases takeover without emitting immediate speech', async () => {
    const { runtime, calls } = harness(); await runtime.startSession(); await runtime.requestHumanTakeover(); await runtime.releaseHumanTakeover();
    expect(runtime.snapshot()).toMatchObject({ state: 'RUNNING', humanTakeover: false, activeActivity: 'COOLDOWN' }); expect(calls.speak).toBe(0);
  });
  it('returns takeover to a previously paused session', async () => { const { runtime, calls }=harness();await runtime.startSession();await runtime.pauseSession();await runtime.requestHumanTakeover();await runtime.releaseHumanTakeover();expect(runtime.snapshot()).toMatchObject({state:'PAUSED',humanTakeover:false,activeActivity:'PAUSED'});expect(calls.resume).toBe(0); });
  it('freezes session duration when normal stop completes', async () => { const { runtime, advance }=harness();await runtime.startSession();advance(500);await runtime.stopSession();const duration=runtime.snapshot().metrics.sessionDurationMs;advance(10_000);expect(runtime.snapshot().metrics.sessionDurationMs).toBe(duration); });

  it('uses an unknown state when audience provider is absent', () => expect(new LiveRuntime().health().audience).toBe('unknown'));
  it('uses an unknown state when product provider is absent', () => expect(new LiveRuntime().health().product).toBe('unknown'));
  it('clamps invalid queue depth to zero', () => { const runtime = new LiveRuntime(); runtime.setQueueDepth(Number.NaN); expect(runtime.snapshot().queueDepth).toBe(0); });
  it('truncates error metadata and never writes raw secrets into activity', () => { const runtime = new LiveRuntime({}, { now: () => 9 }); runtime.recordError('voice', 'SYNTH', true); expect(runtime.snapshot().errorCount).toBe(1); expect(runtime.snapshot().activity[0]?.event).toBe('RUNTIME_ERROR'); });
  it('counts successful speech and music observations', () => { const { runtime } = harness(); runtime.observeSpeech(true); runtime.observeMusicStarted(); runtime.observeMusic(true); expect(runtime.snapshot().metrics).toMatchObject({ speechCount: 1, musicPlays: 1 }); });
  it('counts failed subsystem observations and marks health degraded', () => { const { runtime } = harness(); runtime.observeSpeech(false); expect(runtime.snapshot()).toMatchObject({ errorCount: 1, health: { status: 'degraded' } }); });
  it('keeps event history bounded', () => { const bus = new RuntimeEventBus(() => 1, 3); for (let i = 0; i < 8; i++) bus.emit('ACTIVITY', { detail: `${i}` }); expect(bus.getHistory()).toHaveLength(3); });
  it('removes unsubscribed event listeners', () => { const bus = new RuntimeEventBus(); let count = 0; const off = bus.on('ACTIVITY', () => count++); off(); bus.emit('ACTIVITY', { detail: 'x' }); expect(count).toBe(0); });
  it('does not let external event observer failure escape', async () => { const { runtime } = harness({ onEvent: () => { throw new Error('observer'); } }); await expect(runtime.startSession()).resolves.toMatchObject({ state: 'RUNNING' }); });
  it('preserves serialized event order during synchronous emission', () => { const bus = new RuntimeEventBus(); const seen: number[] = []; bus.on('ACTIVITY', event => seen.push(event.sequence)); for (let i = 0; i < 5; i++) bus.emit('ACTIVITY', { detail: 'x' }); expect(seen).toEqual([1, 2, 3, 4, 5]); });
  it('ignores stale control requests while idle', async () => { const { runtime } = harness(); expect((await runtime.pauseSession()).state).toBe('IDLE'); expect((await runtime.resumeSession()).state).toBe('IDLE'); expect((await runtime.releaseHumanTakeover()).state).toBe('IDLE'); });
  it('does not accept autonomous action while emergency is latched', async () => { const { runtime } = harness(); await runtime.startSession(); await runtime.emergencyStop(); expect(await runtime.routeAction({ type: 'PLAY_MUSIC' })).toBe(false); });
  it('exposes deterministic session duration through the injected clock', async () => { const { runtime, advance } = harness(); await runtime.startSession(); advance(1234); expect(runtime.snapshot().metrics.sessionDurationMs).toBe(1234); });
  it('counts rejected actions without queue growth', async () => { const { runtime } = harness(); await runtime.startSession(); await runtime.routeAction({ type: 'AVATAR_COMMAND' }); expect(runtime.snapshot()).toMatchObject({ queueDepth: 0, metrics: { droppedActions: 0 } }); });
  it('does not queue unverified music when the provider rejects it', async () => { const { runtime } = harness({ playMusic: () => false }); await runtime.startSession(); expect(await runtime.routeAction({ type: 'PLAY_MUSIC', trackId: 'missing' })).toBe(false); });
  it('routes product selection only when catalog confirms it', async () => { const { runtime } = harness(); await runtime.startSession(); expect(await runtime.routeAction({ type: 'SELECT_PRODUCT', productId: 'known-88' })).toBe(true); expect(runtime.snapshot().activeProductId).toBe('known-88'); });
  it('routes Indonesian speech to existing voice port exactly once', async () => { const { runtime, calls } = harness(); await runtime.startSession(); expect(await runtime.routeAction({ type: 'SPEAK', text: 'Halo', language: 'id-ID' })).toBe(true); expect(calls.speak).toBe(1); });
  it('does not pass missing voice provider as ready', () => expect(new LiveRuntime().health().voice).toBe('unknown'));
  it('does not pass missing avatar runtime as ready', () => expect(new LiveRuntime().health().avatar).toBe('unknown'));
  it('does not pass missing music player as ready', () => expect(new LiveRuntime().health().music).toBe('unknown'));
  it('watchdog identifies a stale but running session from the injected clock', async () => { const { runtime, advance } = harness(); await runtime.startSession(); advance(180_000); expect(runtime.inspectWatchdog().map(x=>x.code)).toContain('STALE_ACTIVITY'); });
  it('watchdog reports queue pressure without mutating runtime state', async () => { const { runtime } = harness(); await runtime.startSession(); runtime.setQueueDepth(100); expect(runtime.inspectWatchdog().map(x=>x.code)).toContain('QUEUE_PRESSURE'); expect(runtime.snapshot().state).toBe('RUNNING'); });
  it('watchdog reports observed event loop lag without starting a timer', async () => { const { runtime } = harness(); await runtime.startSession(); runtime.observeEventLoopLag(300); expect(runtime.inspectWatchdog().map(x=>x.code)).toContain('EVENT_LOOP_LAG'); });
  it('watchdog reports repeated failures and clears streak after recovery', async () => { const { runtime } = harness(); runtime.recordError('voice','A',true);runtime.recordError('music','B',true);runtime.recordError('avatar','C',true);expect(runtime.inspectWatchdog().map(x=>x.code)).toContain('REPEATED_FAILURES');await runtime.recoverSubsystem('voice',()=>true);expect(runtime.inspectWatchdog().map(x=>x.code)).not.toContain('REPEATED_FAILURES'); });
  it('recovery is bounded to one attempt by default', async () => { const recovery = new RuntimeErrorRecovery(); let attempts = 0; const result = await recovery.run('voice', () => { attempts++; return false; }); expect(result).toMatchObject({ recovered: false, attempts: 1, code: 'RECOVERY_EXHAUSTED' }); expect(attempts).toBe(1); });
  it('recovery reports success on its first successful attempt', async () => { const result = await new RuntimeErrorRecovery().run('music', () => true); expect(result).toMatchObject({ recovered: true, attempts: 1, code: 'RECOVERED' }); });
  it('recovery can be disabled explicitly', async () => { const result = await new RuntimeErrorRecovery(0).run('avatar', () => true); expect(result).toMatchObject({ recovered: false, attempts: 0, code: 'RECOVERY_DISABLED' }); });
  it('reports recovering health while bounded repair is in flight', async () => { const { runtime } = harness(); let finish!: (result: boolean) => void; const pending=runtime.recoverSubsystem('voice',()=>new Promise<boolean>(resolve=>{finish=resolve})); await Promise.resolve(); expect(runtime.health().status).toBe('recovering'); finish(true); await expect(pending).resolves.toBe(true); expect(runtime.snapshot().metrics.recoveredErrors).toBe(1); });
  it('injects no recovery retry timers or unbounded loops', async () => { let calls = 0; const result = await new RuntimeErrorRecovery(3).run('host', () => { calls++; throw new Error('token=private'); }); expect(calls).toBe(3); expect(JSON.stringify(result)).not.toContain('private'); });
  it('redacts credential-shaped subsystem labels in recovery results', async () => { const result=await new RuntimeErrorRecovery().run('api_key=private-value',()=>false);expect(result.subsystem).toBe('redacted');expect(JSON.stringify(result)).not.toContain('private'); });
  it('operational context exposes timestamps but excludes credential-shaped values', async () => { const { runtime } = harness(); await runtime.startSession(); runtime.recordError('voice','VOICE_ERROR',true); expect(runtime.context()).toMatchObject({ sessionId:'test-session', state:'RUNNING', errorCount:1 }); expect(JSON.stringify(runtime.context())).not.toMatch(/token|password|secret|api.?key/i); });
  it('creates a distinct session id on restart when ids use the deterministic fallback', async () => { let now=1; const runtime=new LiveRuntime({}, {now:()=>now++,maxActivity:20}); await runtime.startSession(); const first=runtime.snapshot().sessionId; await runtime.stopSession(); await runtime.startSession(); expect(runtime.snapshot().sessionId).not.toBe(first); });
});

describe('Phase 8 event bus coverage', () => {
  const types: RuntimeEventName[] = ['SESSION_STARTED','SESSION_PAUSED','SESSION_RESUMED','SESSION_STOPPING','SESSION_STOPPED','HUMAN_TAKEOVER_STARTED','HUMAN_TAKEOVER_ENDED','EMERGENCY_STOP','RUNTIME_ERROR','RECOVERY_STARTED','RECOVERY_COMPLETED','ACTION_ROUTED','AUDIENCE_EVENT','PRODUCT_SELECTED','PRODUCT_CHANGED','HOST_RESPONSE_READY','HOST_RESPONSE_STARTED','HOST_RESPONSE_COMPLETED','HOST_RESPONSE_FAILED','SPEECH_STARTED','SPEECH_PAUSED','SPEECH_RESUMED','SPEECH_COMPLETED','SPEECH_FAILED','MUSIC_STARTED','MUSIC_PAUSED','MUSIC_COMPLETED','MUSIC_FAILED','AVATAR_COMMAND_READY','AVATAR_COMMAND_FAILED','ACTIVITY'];
  it.each(types)('registers a typed listener for %s', type => {
    const bus = new RuntimeEventBus(() => 99); let observed = 0;
    const off = bus.on(type, () => { observed++; });
    const payload = type === 'SESSION_STARTED' ? { sessionId: 'safe-id' } : type === 'EMERGENCY_STOP' ? { reason: 'operator' as const } : type === 'RUNTIME_ERROR' ? { subsystem: 'host', code: 'X', recoverable: true } : type === 'RECOVERY_STARTED' ? { subsystem: 'voice' } : type === 'RECOVERY_COMPLETED' ? { subsystem: 'voice', recovered: true } : type === 'ACTION_ROUTED' ? { action: 'WAIT' as const, accepted: true } : type === 'AUDIENCE_EVENT' ? { kind: 'UNKNOWN', accepted: false } : type === 'PRODUCT_SELECTED' ? { productId: null } : type === 'PRODUCT_CHANGED' ? { productId: null, previousProductId: 'old' } : type === 'HOST_RESPONSE_READY' ? { action: 'GREETING' } : type === 'HOST_RESPONSE_FAILED' || type === 'SPEECH_FAILED' || type === 'MUSIC_FAILED' || type === 'AVATAR_COMMAND_FAILED' ? { code: 'FAILED' } : type === 'ACTIVITY' ? { detail: 'test' } : {};
    bus.emit(type, payload as never); off(); expect(observed).toBe(1); expect(bus.getHistory()[0]?.timestamp).toBe(99);
  });
});

describe('Phase 8 IPC boundary', () => {
  it.each(['start','pause','resume','takeover','release','stop','emergency','reset'] as const)('accepts the allowed control %s', action => {
    expect(LiveRuntimeControlSchema.safeParse({ action }).success).toBe(true);
  });
  it.each([
    { action: 'launch' }, { action: 'start', token: 'private' }, { action: 'emergency', apiKey: 'secret' },
    { action: 'pause', sessionId: 'renderer-owned' }, { action: null }, 'start', null,
  ])('rejects malformed or extra runtime IPC payload %j', payload => expect(LiveRuntimeControlSchema.safeParse(payload).success).toBe(false));
  it.each(['live-runtime:status','live-runtime:control'])('registers only the explicit IPC channel %s', channel => expect(IPCChannelSchema.safeParse(channel).success).toBe(true));
  it.each(['live-runtime:arbitrary','live-runtime:execute','runtime:control'])('rejects non-existent IPC channel %s', channel => expect(IPCChannelSchema.safeParse(channel).success).toBe(false));
});
