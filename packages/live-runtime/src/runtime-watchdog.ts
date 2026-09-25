import type { RuntimeSnapshot } from './types.js';
export type WatchdogFinding = { code: 'EVENT_LOOP_LAG' | 'QUEUE_PRESSURE' | 'STALE_ACTIVITY' | 'REPEATED_FAILURES' | 'SUBSYSTEM_ERROR' | 'UNEXPECTED_STATE'; severity: 'warning' | 'critical'; detail: string };
export class RuntimeWatchdog {
  constructor(private readonly limits: { maxQueueDepth?: number; staleAfterMs?: number; maxEventLoopLagMs?: number; repeatedFailureLimit?: number } = {}) {}
  inspect(snapshot: RuntimeSnapshot, now: number, telemetry: { eventLoopLagMs?: number; consecutiveFailures?: number } = {}): WatchdogFinding[] {
    const findings: WatchdogFinding[] = [];
    if ((telemetry.eventLoopLagMs ?? 0) > (this.limits.maxEventLoopLagMs ?? 250)) findings.push({ code: 'EVENT_LOOP_LAG', severity: 'critical', detail: 'Observed event loop lag exceeded the configured bound' });
    if (snapshot.queueDepth > (this.limits.maxQueueDepth ?? 40)) findings.push({ code: 'QUEUE_PRESSURE', severity: 'warning', detail: 'Runtime queue exceeded its configured bound' });
    if (snapshot.state === 'RUNNING' && snapshot.health.voice !== 'busy' && snapshot.health.music !== 'playing' && snapshot.health.avatar !== 'busy' && snapshot.health.lastActivityAt !== null && now - snapshot.health.lastActivityAt > (this.limits.staleAfterMs ?? 120_000)) findings.push({ code: 'STALE_ACTIVITY', severity: 'warning', detail: 'Runtime activity is older than the configured threshold' });
    if ((telemetry.consecutiveFailures ?? 0) >= (this.limits.repeatedFailureLimit ?? 3)) findings.push({ code: 'REPEATED_FAILURES', severity: 'critical', detail: 'Repeated subsystem failures reached the configured limit' });
    if (snapshot.health.status === 'failed') findings.push({ code: 'SUBSYSTEM_ERROR', severity: 'critical', detail: 'Runtime reports a failed state' });
    if (snapshot.state === 'HUMAN_TAKEOVER' && !snapshot.humanTakeover) findings.push({ code: 'UNEXPECTED_STATE', severity: 'critical', detail: 'Takeover state and takeover latch do not match' });
    return findings;
  }
}
