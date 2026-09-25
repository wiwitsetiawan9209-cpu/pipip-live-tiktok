# Phase 7 — Avatar Engine

## Status and boundary

Phase 7 provides a platform-independent semantic command engine and a mock runtime adapter. It does **not** render the real avatar. There is no Blender integration, model/rig loading, mesh or bone control, face/body tracking, camera, or live platform connection. Phase 8 has not started.

## Flow

`HostResponse` plus host trigger/personality → deterministic emotion, expression, and gesture mapping → validated bounded `AvatarCommandQueue` → `AvatarRuntimeAdapter` → `MockAvatarRuntimeAdapter`.

The host model supplies language-level semantic intent only. The command schema contains no renderer, bone, armature, mesh-coordinate, or animation-clip fields. The runtime boundary validates enums and bounds and rejects unknown top-level fields. Renderer requests cross narrow, payload-validated Electron IPC channels; the renderer cannot access files or shell.

## Semantic behavior

- **Emotions:** neutral, happy, friendly, excited, thinking, surprised, confused, sad, serious.
- **Expressions:** neutral, smile, big smile, surprised, thinking, serious.
- **Gestures:** none, wave, nod, shake head, point product, point left/right, open hands, thinking, celebrate.
- **State machine:** IDLE, LISTENING, THINKING, SPEAKING, REACTING, GESTURING, MUSIC_MODE, HUMAN_TAKEOVER, STOPPED, ERROR. Legal transitions are centrally validated; self transitions are allowed for idempotent updates.
- **Gesture cooldown:** configurable from 2–5 seconds (default 3 seconds); repeated gesture intent inside cooldown is suppressed.
- **Queue:** bounded, priority ordered, FIFO within equal priority, duplicate-suppressed, expiry-checked, cancellable, clearable, and latched by emergency clear.
- **Human takeover:** calls the existing voice controller takeover, stops queued semantic animation, neutralizes the avatar state, and rejects new AI commands until return to AI.
- **Emergency:** clears and latches the avatar command queue, requests mock-runtime stop, and stays STOPPED until reset/resume. It does not close Electron.

## Voice, music, and timing

Voice controller state changes drive SPEAKING, paused, resumed, ended, failure recovery, and human takeover. Full-song playback enters MUSIC_MODE; non-full-song/background playback does not. Music completion returns to IDLE. Viseme support is timing-only: the mock provider yields one generic `speech` activity interval; it does not infer phonemes or mouth shapes. No beat synchronization is fabricated.

## Desktop controls and runtime adapter

The AI Host panel exposes Mock Connect, disconnect, wave/smile/product/excited semantic tests, human takeover/return, reset, and emergency stop. Secure IPC supports state read, connect/disconnect, semantic test, host response, takeover, reset, and emergency stop. Only the mock adapter is currently available; the controls inspect semantic state and do not display a 3D viewer.

The `AvatarRuntimeAdapter` interface defines availability, connect/disconnect, validated command dispatch, state read, and emergency stop. A future adapter can implement this interface in the later runtime phase without allowing the model or renderer to issue low-level transforms.

## Asset inventory

See [avatar-assets.md](avatar-assets.md). The current `Avatar/` SOURCE folder has seven signature-verified JPEGs and no supported 3D model files. WORKING and EXPORT directories do not exist. The inventory tool is read-only with respect to SOURCE.

## Verification limits

The Phase 7 suite has 161 scenarios, including all 100 state-transition combinations. The full project suite passed 510 tests; production build/typecheck passed and `npm audit --audit-level=low` found 0 vulnerabilities. Unit tests exercise the mock state machine, queue, semantic mapping, takeover/emergency behavior, runtime validation, speech/music events, and inventory source protection. They establish software behavior only. They do not establish actual avatar rendering, Blender compatibility, visual quality, or live platform behavior.
