# Automated Live Rehearsal Engine

Phase 14 adds a deterministic, virtual-time rehearsal for the existing Pipip live-session subsystems. It is a simulation and does not connect to TikTok, a real audience, a microphone, a camera, a physical speaker, or an avatar renderer.

## Architecture

`packages/live-rehearsal/` owns structured scenario data, runtime validation, the simulator and typed reports. Each run creates isolated fixtures and adapters, then routes synthetic audience events through the existing Audience Engine, Decision Intelligence, Knowledge Router, Product Engine, Output Judge, Voice/TTS abstraction, Music Engine, Show Director, Personality Manager, Avatar Engine, Live Runtime and Broadcast Engine. Knowledge routing has no external expert providers in rehearsal, so product and policy questions return deterministic knowledge statuses without internet access. Synthetic broadcasts use the local mock adapter. Tool executions are fixed at zero. The TikTok connector is inspected only for configured state and is never opened by a rehearsal.

The exported `VirtualClock` supports deterministic `now()`, `advance(ms)`, `advanceTo(timestamp)` and `reset()` operations. It does not sleep for the scenario duration. Audience ingestion uses the injected clock so event freshness, cooldowns and queue decisions are repeatable. `MOCK` (also accepted as legacy `MOCK_LLM`) responses are deterministic and make no external request. `REAL_OLLAMA` passes host requests through the configured Host Engine when the desktop has configured an Ollama provider and model; no model name is added by the rehearsal. If a real provider is not injected or fails, the report records the failure and the system uses its guarded fallback.

## Scenarios

Scenario definitions live in `packages/live-rehearsal/src/scenarios.ts`, apart from the runner logic. `parseRehearsalScenario` validates event types, time ordering, duration bounds, required comment text and failure codes. A scenario has this shape:

```ts
{
  id: 'example',
  name: 'Example Session',
  durationMs: 180_000,
  events: [
    { atMs: 0, type: 'LIVE_START' },
    { atMs: 5_000, type: 'VIEWER_JOIN' },
    { atMs: 10_000, type: 'COMMENT', text: 'Kak, apa manfaatnya?', productId: 'fixture-mug' },
    { atMs: 180_000, type: 'SESSION_END' },
  ],
}
```

Eighteen fixtures are included: basic sales, product questions, price and stock, recommendation, high comment activity, spam, off-topic, dead air, music, product rotation, human takeover, emergency stop, Ollama failure, TTS failure, product data failure, JEv failure, mixed live activity, and a 31-minute long-running session. Synthetic VIEWER_JOIN, FOLLOW, LIKE, GIFT and SYSTEM events are routed through the existing Audience Engine and Decision Intelligence; the Audience Engine marks non-comment metrics unsupported/ignored instead of adding fake real-world counts. Product facts come only from in-memory Product Engine fixtures. Missing data must remain unknown.

## Modes and failure injection

- `MOCK_LLM`: deterministic host output; suitable for automated tests and offline runs.
- `REAL_OLLAMA`: uses the already-configured Pipip Ollama host engine when supplied by the desktop. Provider unavailability is represented in the report and does not falsely mark the session as real or live.
- Failure events deterministically inject Ollama timeout/unavailability, malformed model output, product engine, TTS, music, avatar, JEv/decision provider, Output Judge and runtime failures. Failures do not disable safety checks.

The simulated TTS provider exercises the production Voice Engine interface and records language, queue/generation timing, accepted/failed/cancelled/rejected state and estimated speech duration. It returns a `simulation://` reference and emits no physical audio. Music playback is exercised with a virtual track; reports record duck and restore levels during accepted speech. Broadcast and avatar output use mock adapters.

## Reports and invariants

Each run returns a typed report with scenario/mode, virtual duration, event and response records, ignored/queued activity, model, request and response counts, deterministic decision counts, fallbacks, Decision Intelligence routing metadata including reason codes, Knowledge Router topic/status records, per-event observations, Output Judge and product validation results, TTS/music/takeover/emergency/show-director events, errors, latency summaries and final runtime state. Reports and desktop snapshots carry `SIMULATION`; audience events are marked `simulator`.

The run checks the fourteen named invariant conditions: Product Engine authority, no LLM tool execution, rejected output blocked before TTS, emergency priority and reset latch, takeover priority, unknown price/stock safety, simulation isolation, TikTok-live claim boundaries, JEv/tool safety, Show Director scheduling output, and deterministic output safety. The long fixture advances 31 virtual minutes and processes over 1,000 events without real-time waiting.

## Desktop controls

The existing desktop UI has a compact Rehearsal panel with scenario and mode selection, Start, Stop, Reset, Clear Report and Run All controls. It shows current scenario, virtual time, state/event, Pipip status, decision, product, music, TTS, error count and invariant-failure count. A notice labels the operation as a simulation.

## Verification boundaries

Passing rehearsal tests prove only that the tested software paths cooperate with these deterministic fixtures and adapters. They do not prove physical audio reaches a speaker, microphone input, camera capture, TikTok LIVE connectivity, a real audience, real avatar rendering, JEv availability, live service credentials, or successful execution against a running local Ollama model. PREPARING and AVATAR_COMMAND emergency origins are represented as requested simulator origin labels because the existing Runtime does not expose those states as stable session states. Manual hardware/service acceptance remains separate.

## Phase 14 verification

- `npm test`: passed, 15 test files and 1,987 tests.
- `npm run typecheck`: passed.
- `npm run build`: passed, including Electron bundle and Vite production bundle.
- `npm audit`: passed, zero vulnerabilities reported.
- All eighteen built-in scenarios ran in `MOCK` mode with passing invariants. The Phase 14 test suite has 267 cases, including a 250-input deterministic adversarial product-claim corpus. Real Ollama, JEv, physical devices and live TikTok were not exercised.
