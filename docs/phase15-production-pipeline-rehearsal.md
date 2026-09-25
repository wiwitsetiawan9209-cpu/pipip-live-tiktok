# Phase 15 — Production Pipeline Rehearsal

Date: 2026-09-25 (Asia/Jakarta)

## Result

Phase 15 is **PARTIAL / NOT READY for production acceptance**. The desktop production source connects the local runtime path. A guarded `LOCAL_PRODUCTION_REHEARSAL` mode now tags local audience events `LOCAL_REHEARSAL`, refuses those events while the mode is off, and excludes rehearsal events from persisted audience-learning feedback. The mode refuses activation while TikTok is connected and turns itself off if TikTok later becomes connected. It does not publish, order, purchase, or connect a real audience.

The production request path was **not** run end to end in the desktop application for all nine requested audience cases. The real-model evidence below is a HostEngine smoke run, not proof of Decision Intelligence, Output Judge, Voice Engine, Audio Engine, or the UI-to-runtime chain working together. No synthetic products were added.

## Production path audit

| Edge | Evidence in source | Status |
|---|---|---|
| Desktop UI → Live Runtime | Renderer invokes `live-runtime:control` and `audience:submit` through preload IPC; main registers the handlers. Rehearsal comments use the same `audience:submit` entry. | CONNECTED |
| Live Runtime → Show Director | `LiveRuntime` delegates start/pause/resume/stop to the real `AutonomousOrchestrator`; main wires `showRuntimePort` with continuity and `MusicShowRuntime`. | CONNECTED |
| Show Director → Decision Intelligence | Audience queue is consumed by `AutonomousOrchestrator.tick()` and evaluated by `DecisionIntelligence`; product fact questions may take the deterministic Product Engine route. | CONNECTED |
| Decision Intelligence → Host Engine | Non-deterministic allowed routes call `HostEngine.generate`; disallowed/escalated/tool routes do not generate speech. | CONNECTED |
| Host Engine → Ollama | Main creates `OllamaProvider` using parsed `config/ai.json`; current configured model is `pipip:live`. | CONNECTED; smoke evidence PARTIAL |
| Host Engine → Output Judge | Successful audience output is checked by the orchestrator's `OutputJudge` before `HOST_RESPONSE_READY`. Rejected output returns before the response event and TTS route. | CONNECTED |
| Output Judge → Voice Engine | Main's `HOST_RESPONSE_READY` handler routes accepted speech through `LiveRuntime.routeAction({type:'SPEAK'})`, whose voice port calls `VoiceEngine`. | CONNECTED in source; not exercised by real production rehearsal |
| Voice Engine → Audio Engine | Voice emits `VOICE_READY`; preload forwards it to renderer `audio-runtime.ts`, which resolves the asset, acknowledges start, and plays through `AudioEngine(WebAudioBackend)`. | CONNECTED in source; physical output unconfirmed |
| Audio Engine → Music Engine | Music events and voice ducking go through the renderer AudioEngine and main `DuckingController`; music files come from configured folders. | PARTIALLY_CONNECTED; no folders/tracks configured |
| Music Engine → Broadcast Engine | Main syncs music/runtime state to `BroadcastEngine`; output adapter is `MockBroadcastOutputAdapter` for local preview. | PARTIALLY_CONNECTED; mock preview only |
| Broadcast Engine → Avatar Engine | Main syncs semantic avatar state to broadcast; avatar adapter is `MockAvatarRuntimeAdapter`. | PARTIALLY_CONNECTED; no real renderer |
| Avatar Engine → TikTok LIVE | No live adapter path is enabled; TikTok connector remains disconnected unless separately configured. | NOT_CONNECTED |

## Local rehearsal mode

The desktop audience simulator now has an explicit **LOCAL PRODUCTION REHEARSAL** control. With it enabled, submitted comments use the `local_rehearsal` source and `LOCAL_REHEARSAL:` event ID prefix. The main process rejects this source unless rehearsal mode is enabled, and the usual audience classifier, spam/abuse filter, queue, orchestrator cooldown, Decision Intelligence, Product Engine, HostEngine, OutputJudge, LiveRuntime, and voice routing remain in place. Rehearsal comments are not added to the audience-learning pipeline.

The mode remains opt-in and resets to off when the app process restarts. A local session and autonomy must still be started through existing controls before comments are accepted. Existing emergency-stop and human-takeover controls remain the runtime authorities. I did not run the nine audience cases through the desktop UI/runtime, nor run the takeover/emergency sequence in a live desktop session.

## Ollama and Pipip

- Configuration: `provider=ollama`, base URL `http://127.0.0.1:11434`, model `pipip:live` from `config/ai.json`.
- `npm run host:smoke` issued **2** HostEngine requests through the existing provider abstraction. One response passed HostEngine schema validation; the second failed with `INVALID_AI_RESPONSE` because `gesture` was outside the allowed enum. The smoke command exited nonzero.
- Successful request latency: **24,069 ms**; valid speech length: recorded by the smoke output but not retained in this report. Failed request latency: **14,599 ms**. No timeout was reported. Successful HostEngine response count: **1/2**.
- The earlier local Ollama diagnostic reported a reachable model and a successful diagnostic response at 11,501 ms request latency; that is diagnostic-path evidence, not a HostEngine production response.
- The smoke run did not call the application's `DecisionIntelligence` or `OutputJudge`, and did not route through the Desktop IPC/LiveRuntime/Voice/Audio path. Therefore the nine required real behavior cases (greeting, product question, price, stock, recommendation, comparison, unknown, off-topic, spam) remain **NOT TESTED** against the end-to-end production path.
- Unsupported price/stock/specification/promotion/order claims are covered by deterministic OutputJudge tests from Phase 14; those tests use fixtures and are not real-model production evidence. No adversarial real-model claims were submitted in this phase.

## Products and policy

The production app uses `ProductCatalog(new SQLiteProductRepository(db))`, a `ProductContextBuilder`, and `ProductClaimPolicy`; orchestrator audience responses go through `OutputJudge` before they can trigger the TTS route. Price and stock question routing can use the existing deterministic verified-product response. Product Engine database rows were not printed or changed for this rehearsal. No fake product row was created.

## Voice, audio, music, show director, runtime

- Voice configuration is enabled with `windows-onecore`, `id-ID`, automatic voice selection. The main process also has Local SAPI and text-only fallback providers. No production-response TTS synthesis/playback was measured in this run. `SOFTWARE_AUDIO_SUCCESS`: NOT TESTED. `PHYSICAL_AUDIO_CONFIRMED`: NOT CONFIRMED.
- Renderer AudioEngine/WebAudioBackend wiring is present in source, but this command-line smoke did not initialize the renderer or play a production response.
- Music config has empty `directories` and an empty lyrics directory: **MUSIC_FOLDER_NOT_CONFIGURED**. No path was created. Ducking is configured and wired in code, but no real track was playing, so music start/duck/restore/stop was not verified in this run.
- The real orchestrator owns greeting/product rotation, queue processing, global speech/product cooldowns, and scheduler ticks. Runtime reaches the continuity/music show runtime. These production behaviors were not exercised as one real desktop rehearsal; scheduler/cooldown behavior remains source-connected, end-to-end unverified.
- LiveRuntime source exposes takeover and emergency-stop controls, clears autonomous work, stops voice/music, blocks outputs, latches emergency state, and requires explicit reset. Phase 14 automated simulations pass, but no Phase 15 live-runtime takeover/emergency desktop rehearsal was run.

## Broadcast, avatar, TikTok

- Broadcast uses a mock local output adapter; it is not a platform stream.
- Avatar is semantic/mock only, without a real 3D renderer.
- TikTok credentials were not used and no connection or publishing was attempted. TikTok LIVE and real audience validation remain unconfigured/unconfirmed.

## Failure recovery and security

- Observed production-path failure: Ollama produced a response that failed HostEngine's enum parser; HostEngine returned a safe failure and smoke exited nonzero. The full orchestrator fallback/retry and output suppression after this failure were not observed through desktop IPC.
- Deterministic Phase 14 tests cover Ollama unavailable/timeout, malformed response, Product Engine failure, OutputJudge rejection, TTS failure, and music failure in simulation. These do not substitute for production dependency fault injection.
- Main-process security source keeps AI/JEv/TikTok credentials in main/config/environment paths; renderer APIs expose status and actions, not credential getters. Log inspection in the smoke output showed provider/model/latency and generated speech, but no credential value. This was a limited source/output review, not a full secret-scanning audit.

## Verification

- Automated tests: **1,989 passed**, 16 files.
- Typecheck: **PASS** (`npm run typecheck`).
- Build: **PASS** (`npm run build`, includes typecheck and Electron/Vite builds).
- npm audit: **0 vulnerabilities**.
- Host smoke: **FAILED overall**, with one HostEngine-valid response and one schema rejection across two requests.
- Added tests: **2** checks for local rehearsal IPC/source tagging and audience queue preservation.

## Remaining validation

1. Run all nine audience cases through the enabled desktop local production rehearsal mode and verify each event's Decision Intelligence route, Output Judge result, and whether speech reached the Voice Engine.
2. Verify product price/stock/variant/specification/benefit/promotion/availability claims using only actual catalog rows, including adversarial generated claims and rejected-output suppression before TTS.
3. Measure event→decision→Ollama→judge→TTS→audio timestamps in a real desktop session and capture request/response latency and response lengths without recording secrets.
4. Exercise Indonesian Windows OneCore synthesis and renderer software playback; confirm physical speaker audibility manually if desired.
5. Configure no music automatically; once an operator configures a valid local music folder, verify start/duck/restore/stop. Physical music audibility remains manual.
6. Exercise actual Show Director schedule/cooldown/rotation/dead-air and LiveRuntime takeover/resume/emergency/reset in the desktop app.
7. Validate local broadcast preview and semantic avatar manually. Real avatar hardware/rendering, TikTok LIVE, physical audio, and real audience remain outside this evidence.
