# Pipip Live Tiktok — AI Live Commerce Host

Local Windows desktop foundation and AI host prototype. TikTok LIVE Studio remains the official broadcaster. This app does not connect to, automate, scrape, or broadcast to TikTok.

## Architecture

- `apps/desktop`: Electron main process, restricted preload bridge, and minimal React/Vite avatar UI.
- `packages/shared-types`: typed host, AI, command, IPC bridge, and status contracts.
- `packages/protocol`: strict Zod validation for configuration, host context/request/response, AI requests, host commands, and IPC.
- `packages/ai-core`: provider interface plus Ollama and OpenAI-compatible adapters. Ollama JSON mode is enabled for structured host output.
- `packages/host-engine`: `HostEngine`, editable prompt loading, context assembly, structured response parser/sanitizer, validated command generation, autonomy gate, and human-event cooldown.
- `packages/product-engine`: validated product domain, SQLite repository over the existing application table, catalog search, verified-context builder, deterministic product rotation/selection, sales-stage planning, and a product-claim policy.
- `packages/orchestrator`: platform-neutral autonomous session loop, audience queue dispatch, decision engine, serializable session memory, scheduler, cooldown and bounded retry/backoff.
- `packages/audience-engine`: normalized audience events, deterministic intent/spam/abuse routing, priority queue, deduplication, bounded retention, and human pause/stop behavior.
- `packages/personality-engine`: built-in host styles with a runtime selector. Style affects delivery only; the host constitution and product policy stay in force.
- `packages/knowledge-engine`: product/policy/general knowledge routing, optional Gemini/OpenAI expert adapters, HTTPS source validation, bounded cache, exact-match policy lookup, and human-labeled evaluation records.
- `packages/logging`: structured logs with sensitive-field redaction. Host requests log trigger/context metadata, provider/model/latency, validated response, commands, and failures; credentials and raw conversation prompts are not logged.
- SQLite is initialized in Electron's user data directory. LIVE opens/closes a local session record; with Autonomy ON it also starts/stops the local orchestrator loop.

The renderer has no Node access. Electron uses context isolation and a sandboxed preload API. IPC origin and payloads are validated in the main process. Host commands are returned as validated data only; no avatar, camera, voice, or hardware executes them in Phase 1.

## Install and run

Use Node.js 22 or newer on Windows 10/11, then run:

```powershell
npm install
npm run dev
```

- `npm run build` type-checks and builds the Electron main/preload and React renderer.
- `npm start` builds and launches the desktop app.
- `npm test` runs the unit tests.
- `npm run typecheck` runs strict TypeScript checking.
- `npm run host:smoke` sends a real local Ollama request through HostEngine, validates it, and prints the speech and generated commands.

## AI and personality configuration

- `config/ai.json` chooses the provider, Ollama base URL, and model. The current setting uses the already-installed local `pipip:live` model. Change the model here to use a different installed model; the source code does not select or silently switch models.
- Ollama must be running at the configured URL. If it is unreachable the UI reports AI OFFLINE. If the configured model is missing it reports MODEL NOT FOUND. Timeouts and invalid model JSON are returned as safe errors with no commands.
- `data/prompts/host-system.md` is the editable base prompt. `data/host/host-constitution.md` adds fixed privacy, factuality, and policy boundaries. The AI panel can select a built-in style at runtime.
- OpenAI-compatible credentials, if selected later, are read only from `AI_API_KEY` in the main process; never commit credentials or expose them to the renderer.
- `config/knowledge.json` keeps external advisors disabled by default. To enable them, set `externalExperts.enabled` and supply `GEMINI_API_KEY` and/or `OPENAI_API_KEY` in the main-process environment. Their text is untrusted host background and never speaks directly. OpenAI requests use the Responses API with `store:false`; Gemini requests use the Interactions API. See the [Gemini API guide](https://ai.google.dev/gemini-api/docs/get-started) and [OpenAI Responses quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request).

## Phase 1 host engine

`HostEngine` validates an incoming `HOST_RESPONSE` request, checks the configured provider, loads the personality, combines it with the trigger and current `HostContext`, requests JSON, safely parses and sanitizes the speech, validates `HostResponse`, and maps it into `SPEAK`, `SET_EMOTION`, `SET_GESTURE`, and optional `SET_SCENE` commands. Unknown triggers outside the Phase 1 manual/comedy and human event routes are rejected. Invalid provider output returns `INVALID AI RESPONSE`; invalid commands never execute.

`HostContext` contains the session id, optional verified product facts, recent conversation, current scene, human presence/state, topic, and audience count. Product facts are assembled in the main process from the application-owned SQLite catalog; product data sent by the renderer is discarded. A deterministic selector chooses only active, in-stock catalog entries and keeps per-run rotation memory. Product claim policy rejects configured forbidden claims and unsupported numeric, discount, review, guarantee, and social-proof claims before command generation.

`HostResponse` requires speech, emotion, gesture, and intent; scene is optional. Values are checked against strict Zod enums before command creation. Recent generated speech is kept in a short in-memory conversation context for the current app run.

Human presence is simulated in the AI panel only. The state list includes silent, coding, holding product, looking at camera, speaking, confused, laughing, and demonstrating. There is no camera detection. Enter/leave triggers require Autonomy ON and share a cooldown; manual generation works with autonomy either ON or OFF. Phase 3 adds a separate autonomous scheduler for the live host session.

## Phase 1 boundaries

The large control dashboard has been replaced by a centered avatar placeholder, visible AI/session status, speech/response labels, and one LIVE/STOP action. Clicking the avatar opens a compact AI panel for provider/model status, manual generation, autonomy, and human simulation. LIVE starts only a local AI host session and attempts an Ollama response. The avatar mouth/status animation is visual feedback; there is no speech audio or real avatar yet.

Not included: TikTok login, scraping, browser/UI automation, TikTok or TikTok LIVE Studio connection, broadcasting, fake webcam, OBS, Android, Blender, real camera/human detection, avatar execution, or payments. No sample products are seeded; operators must enter catalog facts. The UI supports product creation but not editing/deletion or catalog import. The product text policy is deterministic and conservative, not a general natural-language fact verifier; model output that passes it is not a guarantee that every qualitative statement is grounded.

## Phase roadmap

- Phase 0 — Foundation: complete.
- Phase 1 — AI Host Core / Host Engine: complete.
- Phase 2 — Product Catalog + Product Knowledge + Autonomous Product Selector + Sales Brain: implemented and locally verified (44 tests passing).
- Phase 3 = COMPLETE — Autonomous Orchestrator: implemented and locally verified (see below).
- Phase 4 — Audience Intelligence + Host Personality + Knowledge Router: complete.
- Phase 5 — Live Show Director + continuity + local music foundation: implemented and locally verified.
- Phase 6 — Voice/TTS + audio engine: implementation extended for local Indonesian TTS and an explicit output diagnostics workflow; awaiting operator hardware playback and human listening confirmation.
- Phase 7 — Avatar Engine: semantic engine and mock runtime adapter implemented; no real avatar rendering or Blender runtime.
- Phase 8 — Live Runtime & Show Integration: implemented; see [docs/live-runtime.md](docs/live-runtime.md). Local desktop controls and observational health are connected through validated IPC. This does not connect TikTok or render a real avatar.

## Phase 8 live runtime

`packages/live-runtime` centralizes deterministic session lifecycle, typed events, validated action routing, bounded activity history, operational metrics, observational health, takeover, emergency stop/reset, shutdown, bounded recovery, and watchdog inspection. Electron uses the existing Phase 1–7 engines through the runtime adapter; host policy, product facts, local music, Indonesian voice, and semantic mock avatar behavior remain in their original engines. The operator panel exposes runtime state, health, subsystems, queue/error counts, activity, and lifecycle controls. See [docs/live-runtime.md](docs/live-runtime.md) for behavior and limitations.

Phase 8 does **not** implement Blender integration or real avatar rendering. It does **not** implement TikTok APIs, TikTok Shop, browser automation, or external platform control. The audience provider remains unknown unless data is supplied by the local simulator; product facts remain catalog-backed. Physical speaker acceptance is still pending operator confirmation.

## Phase 9 broadcast and visual output

Phase 9 adds a platform-independent Broadcast Engine that maps Phase 8 runtime snapshots and existing Product, Voice, Music, Audience, and semantic Avatar Engine state to prioritized scenes and bounded plain-text overlays. Desktop controls expose a local preview, verified catalog product/price and stock semantics, host/music/avatar state, overlay health, human takeover, emergency stop, and reset through strict validated IPC. Its only output adapter is a deterministic local mock preview.

**PHASE 9 STATUS: IMPLEMENTED — LOCAL PREVIEW / MOCK OUTPUT ONLY.** This does not establish streaming, external platform, camera, device, or OBS acceptance.

- Blender: NOT IMPLEMENTED — deferred to final avatar integration.
- TikTok: NOT IMPLEMENTED — deferred to dedicated platform integration.
- OBS: NO AUTOMATION — output abstraction only.
- Real streaming: NOT IMPLEMENTED.

See [docs/broadcast-engine.md](docs/broadcast-engine.md) for the architecture and limitations. Phase 9 does not start Phase 10.

## Phase 2 product catalog

The AI panel can add product records with catalog facts and request a product intro. Products are stored locally in the existing SQLite `products` table, with extended fields encoded in its existing metadata JSON so prior databases remain readable. The selector filters inactive/out-of-stock products, then ranks relevance, promotion, priority, stock, and recent-mention rotation. Sales planning supports hooks, problem, benefit, product introduction, specification, price, objection handling, comparison, cross-sell, upsell, and CTA stages.

## Phase 3 autonomous orchestrator

When Autonomy is ON, starting a local LIVE session starts `AutonomousOrchestrator`. Its timer calls `tick()`, and the `DecisionEngine` selects a greeting, verified product introduction, available product benefit/specification/price steps, CTA, or WAIT. Each spoken action goes through `HostEngine`; its existing response validation and product-claim policy remain in the path. Validated results and lifecycle/status events return through the narrow preload bridge. There is no direct model call or UI manipulation in the orchestrator package.

Session memory is in-process and resets when a new session starts. Product mention rotation, global speech cooldown, product-intro cooldown, repeated-product cooldown, and bounded exponential retry backoff are deterministic and use injectable clocks/schedulers in tests. Pause is a human override: it cancels the timer and an in-flight generated response is discarded if pause/stop occurs before completion. Resume respects the remaining speech cooldown. STOP AI turns autonomy off; STOP HOST ends the local session.

The current `AudienceStateProvider` and `HumanPresenceProvider` default to UNKNOWN. No viewer count or camera event is fabricated. Phase 4 adds only a local comment simulator; it does not create a TikTok connection. Host commands are validated data only; no TTS, avatar, camera, or platform action is executed. TikTok integration, scraping, browser automation, and broadcasting remain absent.

## Phase 4 audience intelligence, personality, and knowledge routing

The local simulator accepts manually entered comments. The audience engine normalizes comment text and source/event metadata, classifies common commerce intents, filters obvious links/repeated-character spam and heuristic abuse terms, de-duplicates, and prioritizes a bounded in-memory queue. Pause freezes processing; stop clears queued work. Learning records retain intent/topic and a human evaluation label, not the comment text or account identifiers; they do not change prompts, policies, or models automatically.

The host panel selects among friendly, funny, energetic, informative, and balanced styles without restarting. A fixed host constitution keeps privacy, product truth, and policy uncertainty above the selected style. Audience responses still pass through `HostEngine` and its schema/policy checks.

The knowledge router sends product questions only to verified catalog context, and platform-policy queries only to exact platform/market/type source records. `data/policies/tiktok/index.json` is intentionally empty and marked unverified; no TikTok rules are asserted. General questions can optionally request background from Gemini or OpenAI. External output remains untrusted context for the local Ollama-powered `HostEngine`; low-confidence results remain labeled as requiring external expertise, and missing keys or timeouts route to unknown. No external provider is enabled by default, no key is stored in config, and no advisor can publish or speak directly.

Phase 4 does not include TikTok APIs/events, real viewer identity/count, comments from a live platform, TTS/avatar execution, automatic fine-tuning, or automatic policy updates. The simulator and source-only checks do not establish live-platform or device acceptance.

## Phase 5 live show continuity and local music foundation

Phase 5 adds a deterministic show director and continuity package for time awareness, show history, prioritized expiring actions, provenance-checked content opportunities, dead-air states, topic transitions, fallback/recovery, watchdog signals, radio mode, and interruption policy. It plugs into the existing `AutonomousOrchestrator` through a typed show-runtime port; there is no second scheduler. Host language remains generated and validated through `HostEngine`.

The local music library scans only folders listed in `config/music.json`. It indexes supported files without modifying them, reports duplicates and inaccessible/oversized files, and does not expose file paths to the renderer. WAV duration is read from its header; MP3 duration can be estimated from the first MPEG frame and is labeled with `~`. Other formats or malformed files keep duration unknown unless a metadata reader supplies it. Unknown-duration tracks cannot start a deterministic full-song segment. Artist and other unavailable metadata remain unknown.

`LyricsManager` accepts explicitly supplied lyrics or text files in its configured local folder; it does not fetch lyrics. Optional song interpretation reuses the Phase 4 expert provider and remains advisory. Song introductions and after-song contexts pass bounded local track and knowledge fields into the existing host engine. Phase 6 routes the indexed local files through the desktop audio output engine; speaker/device playback was not physically verified in this environment.

To scan music, add local folder paths to `directories` in `config/music.json`, optionally set `lyricsDirectory`, restart the desktop app, then use **SCAN CONFIGURED FOLDERS** in the host panel. `loopBackground` is off by default. No TikTok, TikTok LIVE Studio, or other live platform is connected.

## Phase 6 voice, TTS, and audio engine

The local Windows OneCore provider enumerates installed system voices and synthesizes WAV files without a cloud account or API key. It selects only an exact locale match; an `id-ID` request cannot fall through to an English voice and reports `NO_ID_ID_VOICE` when no Indonesian voice is installed. Windows SAPI remains available as a separate provider. The renderer plays voice and indexed local music through Web Audio; main-process audio assets use short-lived opaque tokens and a restricted IPC bridge. The engine supports separate master/voice/music levels, voice ducking, pause/resume/stop, Chromium output selection when `setSinkId` is available, playback completion, bounded decode/cache state, and a latched emergency stop. If local TTS cannot synthesize, host text remains visible without fabricated audio.

### Phase 6A status on this machine

- Indonesian TTS: **READY** — Windows OneCore, **Microsoft Andika** (`id-ID`, male), WAV, 16 kHz mono. The configured default is `windows-onecore`, `id-ID`, voice `auto`.
- Indonesian phrase suite: **7/7 synthesis checks passed**. Each returned actual locale `id-ID`, positive duration, valid WAV metadata, and no English fallback. Observed synthesis latency in the latest run: **494–552 ms**.
- Windows SAPI: available for installed `en-US` voices (Microsoft David Desktop and Microsoft Zira Desktop); it cannot satisfy an `id-ID` request.
- Audio device discovery and output selection: the diagnostics screen enumerates browser-exposed output devices and requests a default-device playback check through validated IPC. Hardware playback has **not yet been run by an operator** on this machine; device routing acceptance is pending.
- Physical speaker: **UNKNOWN / HUMAN CONFIRMATION PENDING**. “Software playback verified” only means Web Audio reported active playback/progress. After listening, use **I HEARD THE TEST** or **TEST FAILED** to record the human result.
- Music and ducking diagnostics require at least one playable local music track. Add folders to `config/music.json`, restart, and select **SCAN CONFIGURED FOLDERS** before starting the test.
- `config/voice.json` controls the local provider and synthesis limits; `config/audio.json` controls output levels and ducking. No cloud TTS or external audio service is required for the base voice.

The audio diagnostic report records its timestamp, selected/default output label, whether a device was enumerated, software tone progress, voice/music/ducking playback status, playback-start latency when available, and explicit human confirmation. Software playback is never treated as proof that a person heard physical speakers. Phase 6 remains **NOT COMPLETE** until an operator runs the hardware workflow and confirms the required output behavior.

Latest Phase 6A verification: **349 tests passed**, `npm run build` (including typecheck) passed, and `npm audit --audit-level=low` found **0 vulnerabilities**. These software checks do not replace physical audio acceptance.

## Phase 7 semantic Avatar Engine

`packages/avatar-engine` translates validated host response intent and personality into bounded, deterministic semantic emotion/expression/gesture commands. A state machine handles host thinking/speech, full-song mode, human takeover, and emergency stop. A cooldown prevents repeated gestures; the command queue supports priority, FIFO ordering, duplicate suppression, expiry, cancellation, and emergency clearing. Speech synchronization consumes the Phase 6 voice controller state, while the viseme provider supplies only a generic speech timing interval and does not guess phonemes.

The desktop AI Host panel exposes a **mock runtime** connection and semantic test commands. The mock adapter does not load or render an avatar. Phase 7 contains no Blender control, model loading, bone/mesh transforms, camera/face/body tracking, live platform integration, or real-time lip sync. Secure IPC validates host response and test requests in the main process; the renderer has no shell or filesystem access. See [docs/avatar-engine.md](docs/avatar-engine.md) and [docs/avatar-assets.md](docs/avatar-assets.md). `node scripts/inventory-avatar-assets.mjs` reports the `Avatar/` source inventory as JSON without modifying those files.

Phase 7 status: **semantic engine verified** — 161 Phase 7 scenarios pass, including all 100 state-transition pairs. The Phase 7 completion baseline was 510 tests. Phase 8 adds more than 250 deterministic scenarios to the existing suite. These checks do not claim real avatar rendering or Blender integration.

## Phase 10 status — TikTok account and creator connector

**IMPLEMENTED:** secure main-process OAuth 2 authorization-code flow with PKCE/state and registered loopback redirect validation; Electron `safeStorage` encrypted credentials; token refresh; basic identity lookup; explicit scope/status reporting; safe IPC and desktop controls. See [docs/tiktok-connector.md](docs/tiktok-connector.md).

**CONFIGURED:** no TikTok developer credentials or registered redirect are supplied by default.

**AUTHORIZED:** no live TikTok account has been authorized in this environment. Therefore live authentication is **SKIPPED — credentials not configured**.

**NOT_APPROVED / NOT_AUTHORIZED:** these statuses require TikTok app review and user consent. This code cannot establish either from local state alone.

**NOT_VERIFIED:** creator authorization, QR authorization (`QR_AUTH_UNAVAILABLE`), TikTok Shop/showcase products, LIVE product access, and affiliate product access. Product sync leaves the local Product Engine unchanged.

**NOT_SUPPORTED in Phase 10:** TikTok LIVE control or UI automation, product pinning, checkout/payment, scraping, browser automation, OBS automation, and Blender integration. Do not infer that TikTok is integrated for commerce merely because the connector code is present.

## Phase 11 status — real device and integration validation

**AUTOMATED VALIDATION: PASS** — deterministic Phase 11 software/integration scenarios and the full project suite are run as part of the implementation checks. Typecheck and production build are checked separately.

**HUMAN VALIDATION: PENDING** — no physical speaker audibility, microphone, device quality, or in-app operator walkthrough is claimed. The dashboard requires explicit operator confirmation.

**TIKTOK: NOT_CONFIGURED** — client key, client secret, and redirect are absent from the environment. Manual OAuth validation remains pending configuration; no OAuth attempt was made. Commerce/product capabilities remain unavailable unless verified through an approved official API.

**safeStorage: UNKNOWN until the desktop app queries Electron at runtime.** If unavailable, the existing connector blocks credential writes; it does not fall back to plaintext.

**Blender: NOT IMPLEMENTED — intentionally deferred to final avatar integration phase.**

**OBS: NOT IMPLEMENTED — no OBS automation.**

Overall readiness remains **NOT_READY** until required software checks and operator confirmations have been recorded. See [docs/phase11-validation.md](docs/phase11-validation.md). Human device or account evidence is not inferred from automated tests.

## Phase 12 status — Decision Intelligence + JEv

**IMPLEMENTED:** deterministic-first audience comment routing, optional official TypeSafe JavaScript SDK provider, bounded local fallback, confidence validation, Tool Gate, Output Judge, Product Engine fact protection, short-TTL structured cache, cancellation, safe metrics, desktop status/toggle panel, and 200+ deterministic Phase 12 scenarios. FAST and STRONG both use the configured `pipip:live` Ollama model. JEv is **NOT_CONFIGURED** unless `TYPESAFE_API_KEY` is provided; no live JEv call is claimed. Dead-air content routing and tool execution are not connected. See [docs/decision-intelligence.md](docs/decision-intelligence.md).
