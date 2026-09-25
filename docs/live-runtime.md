# Phase 8 — Live Runtime

## Scope and architecture

`packages/live-runtime` coordinates the Phase 1–7 engines through narrow ports. It owns local session lifecycle, operational context, the ordered event bus, action checks, operator interruption, observational health, metrics, bounded activity history, and a deterministic watchdog. Host generation and product claims remain in HostEngine and Product Engine. Music, TTS/audio, and semantic avatar output remain in their existing packages.

The runtime is platform independent. Electron is one adapter: the main process creates a `LiveRuntime` over the existing `AutonomousOrchestrator`, `SpeechController`, `MusicShowRuntime`, `BackgroundMusicLoop`, product catalog, audience engine, and mock avatar engine. Renderer controls use the restricted preload bridge and strict Zod IPC payload validation. Runtime events sent to the UI contain only operational event metadata.

## Lifecycle

States are `IDLE`, `STARTING`, `RUNNING`, `PAUSED`, `HUMAN_TAKEOVER`, `STOPPING`, `STOPPED`, and `ERROR`. The package exports `LIVE_RUNTIME_TRANSITIONS` as the transition policy. Repeated start/pause/resume/stop/emergency requests are safe. Emergency stop latches outputs and blocks restart until `resetAfterEmergency`; reset leaves the session stopped and a separate start is required.

The context snapshot contains session identifiers/timestamps, active product/activity, output activity flags, takeover/emergency latches, last action timestamps, and error count. It has no fields for credentials, tokens, passwords, cookies, or provider secrets.

## Events, action routing, and response control

`RuntimeEventBus` creates monotonically sequenced, timestamped events with an injectable clock and bounded history. Listener failures do not interrupt dispatch. Event names cover lifecycle, audience, product, host response, speech/music/avatar, takeover, emergency stop, recovery, and errors.

`routeAction` accepts typed actions only. It validates speech length/control characters and requires `id-ID` when a language is supplied; it uses the existing bounded voice queue. Product selection requires a catalog lookup. Music uses the existing show/music runtime. Autonomous actions are rejected during takeover and after emergency stop. Host responses are still generated and checked by HostEngine's existing parser, product-claim policy, and host constitution before the orchestrator emits them.

## Subsystem behavior

- **Voice/audio:** Uses the existing voice controller and configured queue limits. Runtime-routed speech is Indonesian (`id-ID`); no English fallback is introduced. Existing voice state and Web Audio IPC remain authoritative for playback.
- **Music:** Uses the existing show runtime, background loop, music player, and ducking controller. Runtime health reads the current playback state; it does not claim playback when the engine has no state.
- **Avatar:** Uses Phase 7 semantic state and `MockAvatarRuntimeAdapter`. No renderer, rig, Blender, camera, or tracking adapter exists.
- **Audience:** Uses the normalized local Audience Engine. The desktop has a local simulator, not a live event provider; runtime health reports audience as unknown when no provider is connected.
- **Product:** Catalog lookup remains authoritative. Missing or unavailable catalog state is unknown; runtime does not fill in price, stock, benefits, or sales.

## Takeover, emergency stop, and shutdown

Human takeover pauses orchestration, sets the voice takeover latch (stopping queued speech), and sends neutral semantic avatar state. Release resumes through the existing orchestrator cooldown and does not call the host directly. Emergency stop stops orchestration, speech, music, and avatar activity, clears runtime pending queue depth, and remains latched until explicit reset. Graceful shutdown is idempotent and stops orchestrator, speech, music, and avatar takeover state before returning `STOPPED`.

The watchdog checks measured event-loop lag, stale idle activity, queue pressure, repeated failures, failed runtime state, and impossible takeover combinations. The Electron main process samples event-loop delay every five seconds; the runtime package itself exposes deterministic inspection and schedules no retry loop. `RuntimeErrorRecovery` caps attempts at three (one by default), returns structured results, and does not expose thrown messages. Subsystem error details on the runtime event stream are bounded identifiers/codes rather than provider error text.

## Health, activity, and metrics

Health is observational. Missing providers and unrecognized states report `unknown`, which makes overall health degraded. Session snapshots include queue depth, error count, last activity, session duration, speech/music/avatar counters, audience event count, routed/dropped actions, recovery count, takeover count, and emergency-stop count. They do not estimate audience size, sales, or conversion. Activity history is bounded to 100 entries in the desktop runtime.

## Testing

`tests/phase8-live-runtime.test.ts` adds more than 250 deterministic scenarios with injected clocks and fake subsystem ports. It covers lifecycle repetition, routing and validation, event order and listener isolation, subsystem health, human takeover, emergency latch/reset, watchdog checks, recovery bounds, metrics, unknown audience/product state, IPC payloads, and session duration. Existing Phase 1–7 tests remain in the same Vitest suite.

## Known limitations

- The local audience UI is a simulator; live comments/viewer/follow/like/gift signals are unavailable.
- The desktop avatar adapter is mock semantic output only; no rendered avatar is provided.
- The live runtime coordinates existing host and show engines, but a full platform output acceptance workflow is still outside this phase.
- Physical speaker playback still requires operator listening confirmation from the Phase 6A diagnostics.
- Runtime metrics are in-memory operational counters for the current app run/session; they do not represent commerce outcomes.
- Electron renderer displays AI readiness and engine status snapshots; it does not connect to a broadcaster or external platform.

## Explicitly deferred

- Blender integration: not implemented; deferred to the final avatar integration phase.
- TikTok integration: not implemented; deferred to the dedicated platform integration phase.
