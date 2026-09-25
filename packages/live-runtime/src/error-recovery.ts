export interface RecoveryResult { subsystem: string; recovered: boolean; attempts: number; code: string }
const safeSubsystem=(value:string)=>/(?:api.?key|access.?token|refresh.?token|password|secret|cookie|credential)/i.test(value)?'redacted':value.replace(/[^A-Za-z0-9_.:-]/g,'').slice(0,40)||'unknown';
export class RuntimeErrorRecovery {
  constructor(private readonly maxAttempts = 1) { if (!Number.isInteger(maxAttempts) || maxAttempts < 0 || maxAttempts > 3) throw new Error('Recovery attempts must be between 0 and 3'); }
  async run(subsystem: string, recover: () => Promise<boolean> | boolean): Promise<RecoveryResult> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try { if (await recover()) return { subsystem: safeSubsystem(subsystem), recovered: true, attempts: attempt, code: 'RECOVERED' }; } catch { /* retry is bounded and errors remain redacted */ }
    }
    return { subsystem: safeSubsystem(subsystem), recovered: false, attempts: this.maxAttempts, code: this.maxAttempts ? 'RECOVERY_EXHAUSTED' : 'RECOVERY_DISABLED' };
  }
}
