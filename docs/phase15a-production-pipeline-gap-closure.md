# Phase 15A — Production Pipeline Gap Closure

Run date: 2026-09-25  
Project: `C:\Users\Admin\Downloads\Pipip Live Tiktok`

## Summary

Phase 15A repaired the invalid-gesture boundary, fixed a strict-context integration bug, and added OutputJudge enforcement to every autonomous orchestrator speech path. The nine-case local rehearsal ran against the configured `ollama` provider and unchanged `pipip:live` model. Five Ollama requests completed; three responses reached `windows-onecore` Indonesian synthesis and the simulated AudioEngine backend. One host response was rejected by OutputJudge before TTS, and one was rejected by HostResponse schema validation. No price or stock was spoken because the local Product Engine database contained zero products.

This is source, deterministic-test, and headless production-class evidence. It is not desktop renderer/WebAudio, speaker audibility, physical ducking, TikTok, or live-service acceptance.

## Root causes and changes

1. Ollama's `format: "json"` constrained JSON syntax, not the HostResponse enum. The prompt did not enumerate the permitted gestures clearly, so `pipip:live` emitted an out-of-enum value. The strict Zod schema was correct and remains unchanged. Prompt guidance now lists the allowed gestures; parser diagnostics repair only an invalid `gesture` value to the safe `talking` value when that is the sole schema issue. Other invalid fields and malformed payloads remain rejected before TTS. The engine log records the normalization.
2. Production `PersonalityManager.getActive()` returns a `description` field, while strict `HostContextSchema` accepts only `id`, `name`, and `style`. That extra property caused `HostEngine` to reject otherwise valid production requests before Ollama. Main now projects the active personality to those three schema fields at the affected call sites.
3. The rehearsal revealed OutputJudge was applied to audience responses but not to autonomous greeting/product responses or Show Director responses. The orchestrator now runs every successful generated speech result through OutputJudge before emitting `HOST_RESPONSE_READY`; rejected output enters cooldown and is never routed to VoiceEngine. Show Director plan completion receives `success=false` when its text is rejected.
4. Punctuation-only normalized audience text is now rejected as `empty`, rather than misreported as a full queue.

The strict schema still rejects arbitrary gestures (including `dance`); the safe parser fallback does not expand the accepted schema enum.

## Nine-case Ollama rehearsal

Command: `npm run phase15a:rehearsal`  
Provider/model: `ollama` / `pipip:live`  
Product records: 0 (database opened read-only)  
Configured music directories: 0  
All timestamps below are from the rehearsal output, UTC. Audio completion means simulated backend completion, not audible speaker output.

| Case | Event (UTC) | Decision route / outcome | Ollama | Judge | TTS (`id-ID`) | Audio completion |
|---|---|---|---:|---|---|---|
| GREETING | 13:08:44.475 | greeting | 9,310 ms | ACCEPT, 1.713 ms | 546 ms, success | 13:08:59.134 simulated |
| PRODUCT_QUESTION | 13:09:23.836 | LLM_FAST, normalized intent | 21,146 ms | REJECT, 0.395 ms | Not called | Not called |
| PRICE_QUESTION | 13:09:50.018 | DETERMINISTIC, `PRODUCT_FACT_LOOKUP`; no verified product | Not called | Not called | Not called | Not called |
| STOCK_QUESTION | 13:09:50.019 | DETERMINISTIC, `PRODUCT_FACT_LOOKUP`; no verified product | Not called | Not called | Not called | Not called |
| PRODUCT_RECOMMENDATION | 13:09:50.020 | LLM_FAST, `PRODUCT_RECOMMENDATION` | 16,471 ms | ACCEPT, 0.864 ms | 522 ms, success | 13:10:12.024 simulated |
| COMPARISON | 13:10:36.512 | LLM_STRONG, `COMPARISON_REQUIRES_REASONING` | 23,067 ms | Not reached | Not called; invalid HostResponse enum rejected | Not called |
| UNKNOWN | 13:11:04.605 | LLM_STRONG fallback, `JEV_UNAVAILABLE_FALLBACK` | 10,745 ms | ACCEPT, 0.024 ms | 613 ms, success | 13:11:20.995 simulated |
| OFF_TOPIC | 13:11:45.377 | Filtered as `ignored` | Not called | Not called | Not called | Not called |
| SPAM | 13:11:45.377 | Filtered as `ignored` | Not called | Not called | Not called | Not called |

All five Ollama transport calls completed successfully. This does not mean all model responses were acceptable: the comparison response failed strict schema validation; product question was blocked by OutputJudge. OutputJudge rejection count was 1, and no TTS was requested for that rejected response. Decision Intelligence used its configured deterministic fallback because JEv was unavailable (`jevDecisionCount=0`, `fallbackDecisionCount=6`). Ollama request latency was 9,310–23,067 ms. Event-to-simulated-audio-completion spans were 14,659 ms (greeting), 22,004 ms (recommendation), and 16,390 ms (unknown); these spans include synthesis and simulated playback duration.

The Price/Stock routes were correctly deterministic, but no product facts could be verified or spoken because the local catalog was empty. Price, stock, specification, benefits, promotion, variant, and unknown-product rejection cases are also covered by deterministic OutputJudge tests with an in-memory verified product fixture.

## Component audit and boundaries

- **Runtime, director, decisions:** Existing `LiveRuntime`, `AutonomousOrchestrator`, Decision Intelligence, show-continuity, music-show, cooldown, and queue components are retained. The orchestrator remains the scheduler authority; Ollama does not schedule. Existing deterministic tests exercise lifecycle/cooldown, decision routes, product rotation, queue, takeover, and emergency behavior. The nine-case harness calls the production `AutonomousOrchestrator.tick()` and related production classes, but does not attach the desktop's `showRuntimePort`/music-continuity authority. That composition remains a GUI integration check.
- **Host/Ollama:** Configured provider and model were not changed. Invalid response/schema failures are fail-closed with bounded retry/backoff; transport success is recorded separately from accepted speech.
- **Product Engine and OutputJudge:** Product Engine remains the source of price/stock/catalog truth. Tests cover unsupported price/number, unknown stock, specification, benefit, promotion, variant, and product references. ACCEPT continues to TTS; REJECT/ESCALATE do not. New regression tests specifically cover the previously unguarded autonomous greeting and Show Director paths.
- **Voice:** Rehearsal used the configured Windows OneCore provider with `id-ID`. Three software synthesis calls succeeded; the run does not establish that a human heard sound. A deterministic injected TTS failure test confirms no ready audio asset is emitted.
- **Audio:** Rehearsal used `SimulatedAudioBackend`, not the desktop `WebAudioBackend`. Three simulated playbacks completed. An injected AudioEngine backend failure test confirms the software path fails closed. Physical output device, actual playback audibility, audio-device acknowledgements, and device errors still require desktop/hardware checks.
- **Music and ducking:** Music engine and ducking controller remain present. `config/music.json` has an empty `directories` list, so the desktop scan now returns and displays `MUSIC_FOLDER_NOT_CONFIGURED`; no music folder was created. Music playback/restore and physical ducking were not exercised; status `PHYSICAL_DUCKING_NOT_TESTED`.
- **Broadcast/avatar/TikTok:** Existing broadcast and avatar adapters are outside the audio acceptance claim; the harness uses the mock avatar adapter. TikTok was disconnected and no external output was attempted.
- **Takeover/emergency:** Existing LiveRuntime control paths and deterministic tests cover takeover queue clearing, voice blocking, emergency latch, reset, and autonomous suppression. Hardware audio/music stop behavior is not established by these software tests.

## Security and latency

Source review confirms provider and external-expert keys are read in the Electron main process; TikTok credentials use encrypted storage through Electron `safeStorage`. Renderer access is through narrow preload IPC methods and status/capability results. The rehearsal report omits generated speech and credential values; host/orchestrator logs avoid request headers and token payloads. TikTok tokens, provider keys, and credentials are not intentionally placed in Decision Intelligence inputs or Ollama prompts. This is a source review, not a dynamic renderer/IPC penetration test.

Measured fields include event, decision, Ollama request start/completion, OutputJudge, TTS, and audio start/completion where those stages execute. Rejected and filtered cases correctly have no downstream-stage timestamp. Audio timing was measured through simulated completion. The sample's event-to-audio figures above are not a live desktop latency SLA.

## Regression evidence

- `npm test`: PASS, 16 files / 2,004 tests.
- `npm run typecheck`: PASS.
- `npm run build`: PASS; Electron main bundle and Vite renderer production bundle built.
- `npm audit`: PASS, 0 vulnerabilities.
- Focused additions: invalid gesture parser strictness, context projection, product/output claim rejection, OutputJudge-before-TTS for greeting and Show Director, TTS failure, audio failure, empty audience input.

## Remaining acceptance work

Manual desktop validation remains for Electron renderer and actual main-process `showRuntimePort` composition, output device selection, WebAudio playback, physical speaker audibility, voice/music duck and restore, music failure events, and full show continuity/dead-air behavior. Music remains unconfigured until the operator supplies a real music folder. TikTok authorization/live output and Camera/Blender/n8n/3D work are outside Phase 15A scope and were not performed.
