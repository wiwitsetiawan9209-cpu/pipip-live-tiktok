# Phase 11 — Real Device and Integration Validation

## Status and evidence boundaries

Phase 11 adds a persisted validation session dashboard, safe validation records, software checks based on actual engine/diagnostic state, operator-confirmed results, and deterministic integration tests. Results distinguish `AUTOMATED_PASS`, `HUMAN_VERIFIED`, `NOT_TESTED`, `FAILED`, `NOT_AVAILABLE`, and `NOT_CONFIGURED`.

The dashboard never upgrades device enumeration or software playback to human audibility. A listed output means only that the browser reported it. A green software audio check means the Web Audio/TTS path reported playback; only an operator's explicit confirmation can mark audibility as `HUMAN_VERIFIED`.

Current environment evidence: the Phase 11 automated tests/build are exercised locally; physical speaker/microphone listening and in-app UI operation were not performed by the implementer. TikTok client key, client secret, and redirect are absent from the process environment, so no OAuth attempt is made. Electron `safeStorage` availability is only reported by the running app after startup; it has not been queried from the test runner.

## Validation architecture and records

`packages/validation-engine` owns session state, record validation, secret redaction, the subsystem matrix, and the readiness gate. Electron persists its bounded snapshot in the existing SQLite `settings` table under `phase11-validation`. Records contain only a generated ID, category, fixed test ID, status, timestamp, operator-confirmed flag, and bounded safe notes/error code. The UI offers no free-text evidence or credential fields.

The dashboard reports runtime and broadcast states from their current engines, device names/default/availability from the existing output-device enumeration, TikTok configuration as a boolean, and the Electron safe-storage availability state. It never returns OAuth values. Credentials and TikTok identity data are not copied into validation records. **RUN AUTOMATED CHECKS** runs the repository's `npm test`, `npm run typecheck`, `npm run build`, and `npm audit` commands in the project root, stores only pass/fail plus a safe error code, and does not retain command output. The test-suite result also marks the mock avatar, runtime, and takeover scenarios as automated evidence; it does not mark their human checks complete.

Each session has an ID, start/completion timestamps, optional operator label, and at most 500 records. The store keeps at most 30 sessions and presents the most recent eight. An explicit NOT NOW result remains `NOT_TESTED`.

## Audio and Indonesian TTS

Use **START AUDIO TEST** in the audio panel. It reuses the existing output selection, Web Audio playback, local Indonesian Voice Engine and indexed Music Engine. The sequence checks a test tone, two Indonesian (`id-ID`) phrases with a short pause, a local music sample, Indonesian speech while music is playing, observed software ducking, and software music restoration. No English voice fallback is used. Missing Indonesian TTS or a usable local music track does not create a passing result.

The dashboard records software checks for audio output, voice, music and ducking from the diagnostic report. After listening, the operator can separately confirm voice, music, ducking, and overall audio or record failure/NOT NOW. Music PLAY/PAUSE/RESUME/STOP/NEXT controls and volume controls remain the existing Music and Audio Engine controls. A track must exist for sample, NEXT, and loop validation.

## Emergency stop and reset

**RUN EMERGENCY STOP TEST** uses an enabled local track and Indonesian TTS. It waits until voice playback, music playback, and ducking overlap, then invokes the existing emergency path. The software result is accepted only when voice and avatar queues are empty, voice/music/runtime/avatar/broadcast emergency states are latched, and broadcast overlays are cleared. Physical output still requires the operator's confirmation.

Reset remains explicit. Reset closes the active local session, turns autonomy off, clears the emergency latch, and leaves the runtime stopped. It does not restart speech or background music. The operator can then start a new session intentionally.

## Desktop UI smoke test

The dashboard exposes the existing runtime controls for START, PAUSE, RESUME, HUMAN TAKEOVER, RELEASE, and STOP, and shows live runtime state. Emergency stop and explicit reset use existing engine operations. Operator confirmation is accepted only for listed test IDs; runtime/takeover confirmations require the expected transitions in the runtime's recorded activity. App-wide readiness remains `NOT_READY` until all required software and human checks are present.

## Broadcast Preview and product fixture

Broadcast automated status is recorded only after the local mock preview reports `LIVE` and healthy. Human confirmation requires that local preview to remain active. This is not a stream or TikTok output.

The validation suite uses the isolated `validation-product-001` fixture (`Produk Uji Pipip`, Rp15.000, stock 10) only in tests. It is never inserted into the user's SQLite catalog. Tests verify Indonesian price formatting and that unknown price/stock remain unknown. Existing Broadcast Engine data continues to come from Product Engine.

## Avatar semantic, Live Runtime, takeover

Automated tests use `MockAvatarRuntimeAdapter` and verify semantic commands/state only. No 3D avatar is drawn. Integration scenarios check one product selection and one speech route, host/semantic avatar/broadcast updates, takeover blocking speech and avatar commands, cooldown return, emergency queue clearing, broadcast emergency state, and explicit reset to stopped state.

The app's existing Avatar Engine controls remain available for operator inspection. Semantic test outcomes are software evidence; there is no physical avatar or Blender acceptance.

## TikTok manual validation and storage

The dashboard reads configuration presence without showing any secret value. When client key, client secret, and a valid registered loopback redirect are not all configured, **TEST TIKTOK AUTH** is disabled and the result is `NOT_CONFIGURED`. With configuration and secure storage available, the control starts the existing Phase 10 connector; TikTok consent stays manual, scopes remain explicitly configured, and only the existing official Login Kit flow is used.

TikTok OAuth can be marked human-verified only when the existing connector reports `CONNECTED`. Account verification also requires a connected account. The connector's Shop/showcase/LIVE/affiliate product capabilities remain `NOT_VERIFIED`; the Phase 11 matrix reports product capability and sync as `NOT_AVAILABLE` unless a verified official source is actually available. No test product is fabricated.

Electron `safeStorage` is queried at app runtime. If it reports unavailable, the Phase 10 credential store blocks token writes and the connection control is disabled. No plaintext fallback is added.

## Readiness criteria

Overall readiness stays `NOT_READY` until the current records contain passing automated suite, typecheck, build, audit, audio software, Live Runtime and broadcast checks, plus operator-confirmed audio audibility and emergency stop. TikTok OAuth is additionally required only when the developer app is configured. A configured-but-failed critical check yields `BLOCKED`. Unavailable commerce capability is displayed as unavailable and cannot count as a pass.

Build/test command results are reported in the final implementation report. The app does not guess those results from device state; the persisted dashboard only changes when a trusted software observation or the operator records a result.

## Automated testing and limits

`tests/phase11-validation.test.ts` adds 204 deterministic scenarios, including 180 record category/status cases, false-readiness gates, safe redaction, mocked runtime/takeover/emergency integration, and the isolated product fixture. The runtime scenario asserts event ordering, a single product selection and speech start, and music play/duck/restore calls. Together with prior tests it is part of the full suite. No automated case needs a speaker, microphone, real TikTok credentials, camera, internet, Blender, or OBS.

Human audio audibility, actual physical device quality, and real TikTok consent are not automated. The in-app dashboard itself was typechecked and built, but a real GUI/device walkthrough is still `NOT_TESTED` until an operator runs it.
