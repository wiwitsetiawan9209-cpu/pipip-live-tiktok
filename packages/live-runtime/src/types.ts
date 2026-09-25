export type LiveRuntimeState = 'IDLE' | 'STARTING' | 'RUNNING' | 'PAUSED' | 'HUMAN_TAKEOVER' | 'STOPPING' | 'STOPPED' | 'ERROR';
export type RuntimeHealthStatus = 'healthy' | 'degraded' | 'recovering' | 'failed';
export type SubsystemHealth = 'ready' | 'busy' | 'playing' | 'error' | 'unknown';

export interface RuntimeEventMap {
  SESSION_STARTED: { sessionId: string };
  SESSION_PAUSED: Record<string, never>;
  SESSION_RESUMED: Record<string, never>;
  SESSION_STOPPING: Record<string, never>;
  SESSION_STOPPED: Record<string, never>;
  HUMAN_TAKEOVER_STARTED: Record<string, never>;
  HUMAN_TAKEOVER_ENDED: Record<string, never>;
  EMERGENCY_STOP: { reason: 'operator' | 'runtime' };
  RUNTIME_ERROR: { subsystem: string; code: string; recoverable: boolean };
  RECOVERY_STARTED: { subsystem: string };
  RECOVERY_COMPLETED: { subsystem: string; recovered: boolean };
  ACTION_ROUTED: { action: RuntimeAction['type']; accepted: boolean };
  AUDIENCE_EVENT: { kind: string; accepted: boolean };
  PRODUCT_SELECTED: { productId: string | null };
  PRODUCT_CHANGED: { productId: string | null; previousProductId: string | null };
  HOST_RESPONSE_READY: { action: string };
  HOST_RESPONSE_STARTED: Record<string, never>;
  HOST_RESPONSE_COMPLETED: Record<string, never>;
  HOST_RESPONSE_FAILED: { code: string };
  SPEECH_STARTED: Record<string, never>;
  SPEECH_PAUSED: Record<string, never>;
  SPEECH_RESUMED: Record<string, never>;
  SPEECH_COMPLETED: Record<string, never>;
  SPEECH_FAILED: { code: string };
  MUSIC_STARTED: Record<string, never>;
  MUSIC_PAUSED: Record<string, never>;
  MUSIC_COMPLETED: Record<string, never>;
  MUSIC_FAILED: { code: string };
  AVATAR_COMMAND_READY: Record<string, never>;
  AVATAR_COMMAND_FAILED: { code: string };
  ACTIVITY: { detail: string };
  TIKTOK_CONNECTION_STATUS: { state:'TIKTOK_DISCONNECTED'|'TIKTOK_CONNECTED'|'TIKTOK_PERMISSION_LIMITED'|'TIKTOK_REAUTH_REQUIRED'|'TIKTOK_ERROR' };
}

export type RuntimeEventName = keyof RuntimeEventMap;
export type RuntimeEvent<K extends RuntimeEventName = RuntimeEventName> = {
  [P in K]: { type: P; timestamp: number; sequence: number; payload: RuntimeEventMap[P] }
}[K];

export type RuntimeAction =
  | { type: 'SPEAK'; text: string; language?: string }
  | { type: 'PLAY_MUSIC'; trackId?: string }
  | { type: 'STOP_MUSIC' }
  | { type: 'DUCK_MUSIC' }
  | { type: 'RESTORE_MUSIC' }
  | { type: 'AVATAR_COMMAND'; emotion?: string; expression?: string; gesture?: string }
  | { type: 'SELECT_PRODUCT'; productId: string }
  | { type: 'WAIT' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'TAKEOVER' }
  | { type: 'STOP' };

export interface RuntimeHealth {
  status: RuntimeHealthStatus;
  sessionState: LiveRuntimeState;
  voice: SubsystemHealth;
  music: SubsystemHealth;
  avatar: SubsystemHealth;
  audience: 'ready' | 'unknown' | 'error';
  product: 'ready' | 'unknown' | 'error';
  queueDepth: number;
  eventLoopLagMs: number;
  errorCount: number;
  lastActivityAt: number | null;
  timestamp: number;
}

export interface RuntimeMetrics {
  sessionDurationMs: number;
  speechCount: number;
  speechFailures: number;
  musicPlays: number;
  musicFailures: number;
  avatarCommands: number;
  avatarFailures: number;
  audienceEvents: number;
  processedEvents: number;
  ignoredEvents: number;
  queuedActions: number;
  droppedActions: number;
  recoveredErrors: number;
  humanTakeoverCount: number;
  emergencyStopCount: number;
}

export interface RuntimeActivity { timestamp: number; event: string; detail: string }
export interface RuntimeSnapshot {
  sessionId: string | null;
  state: LiveRuntimeState;
  startedAt: number | null;
  activeProductId: string | null;
  activeActivity: string | null;
  humanTakeover: boolean;
  emergencyStopped: boolean;
  errorCount: number;
  queueDepth: number;
  health: RuntimeHealth;
  metrics: RuntimeMetrics;
  activity: RuntimeActivity[];
}

export interface LiveRuntimeContext {
  sessionId: string | null; startedAt: number | null; state: LiveRuntimeState; activeProductId: string | null; activeActivity: string | null;
  speechActive: boolean; musicActive: boolean; avatarActive: boolean; humanTakeover: boolean; emergencyStopped: boolean;
  lastActionAt: number | null; lastSpeechAt: number | null; lastProductActionAt: number | null; errorCount: number;
}

export interface LiveRuntimePorts {
  orchestrator?: { start(id: string): unknown; stop(reason?: 'live' | 'autonomy'): void; pause(): void; resume(): void; getState(): { running?: boolean; paused?: boolean; currentIntent?: string | null; currentProductId?: string | null } | null };
  voice?: { speak(input: { text: string; language: string; priority: 'HIGH' }): Promise<{ accepted: boolean; error?: string }>; stop(clearQueue?: boolean): unknown; pause?(): unknown; resume?(): unknown; setHumanTakeover?(active: boolean): unknown; emergencyStop?(): unknown; resetEmergency?(): unknown; getStatus?(): { state?: string; queueLength?: number; emergencyStopped?: boolean; lastError?: string | null } };
  music?: { stop(): unknown; pause?(): unknown; resume?(): unknown; getStatus?(): { playbackState?: string; state?: string; playing?: boolean; error?: string | null } };
  avatar?: { humanTakeover(active: boolean): unknown; emergencyStop(): Promise<unknown>; resume?(): Promise<unknown>; disconnect?(): Promise<unknown>; command?(command: { emotion?: string; expression?: string; gesture?: string }): Promise<boolean>; snapshot?(): { state?: string; connected?: boolean; emergencyStopped?: boolean; queueLength?: number; lastError?: string | null } };
  audience?: { getStatus?(): 'ready' | 'unknown' | 'error'; getQueueDepth?(): number };
  product?: { getStatus?(): 'ready' | 'unknown' | 'error'; hasProduct?(id: string): boolean };
  selectProduct?(id: string): boolean;
  playMusic?(id?: string): boolean;
  duckMusic?(): void;
  restoreMusic?(): void;
  onEvent?(event: RuntimeEvent): void;
}

export interface LiveRuntimeOptions { now?: () => number; maxActivity?: number; sessionId?: () => string }
