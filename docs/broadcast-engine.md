# Phase 9 — Broadcast and Visual Output Engine

`packages/broadcast-engine` is a local semantic presentation layer for the Phase 8 Live Runtime. Electron's main process supplies the runtime snapshot, catalog records, music playback state, voice state, and semantic avatar snapshot. The package does not generate host responses or product facts.

## Scenes and lifecycle

The scene manager supports `DEFAULT`, `PRODUCT`, `PRODUCT_FOCUS`, `HOST_SPEAKING`, `MUSIC`, `WAITING`, `HUMAN_TAKEOVER`, `EMERGENCY`, and `ERROR`. Priorities are defined in `scene-manager.ts`: default/waiting/music/host/product/product-focus (0–50), error (80), human takeover (90), emergency (100). Higher priority scenes temporarily replace lower priority scenes; emergency and takeover cannot be displaced by ordinary scenes. Lifecycle transitions are validated and repeated start/stop actions are idempotent.

Broadcast lifecycle states are `IDLE`, `PREPARING`, `LIVE`, `PAUSED`, `HUMAN_TAKEOVER`, `EMERGENCY_STOPPED`, `STOPPING`, `STOPPED`, and `ERROR`. `LIVE` means the local preview output is rendering; it does not mean that an external stream is active.

## Overlays and product data

The bounded FIFO priority queue suppresses duplicate IDs, expires stale entries, supports pause/resume/cancel/clear, and limits queued and visible overlays. Overlay objects carry typed semantic fields and plain text only; React renders them as text. No HTML, script, or renderer-provided product facts cross IPC.

Product overlays are built from a `Product` record returned by `ProductCatalog`. Names are preserved. Numeric prices are formatted using the catalog currency and Indonesian locale; unavailable/invalid prices remain unavailable. A verified promo price is shown separately from the regular price. Stock `null` is `UNKNOWN`, zero is `OUT_OF_STOCK`, and low stock is a presentation threshold of five or fewer verified units; no counters or urgency are invented.

CTA strings are conservative configurable presentation labels. The built-in operator test uses “LIHAT PRODUK”; it does not claim purchase, payment, or order completion. Host, music, avatar, activity, and audience render states are derived from their existing runtime/engine snapshots. Unknown audience data stays unavailable and no viewer, like, comment, follower, gift, or sales counters are shown.

## Preview and output adapter

The desktop panel presents current scene, output state, verified product and price, host/music/avatar semantics, overlay/queue counts, and emergency/takeover state. `MockBroadcastOutputAdapter` is the only implementation in this phase. It represents a local preview target and supports deterministic failure injection for tests. `BroadcastOutputAdapter` is the platform-independent boundary for a future adapter; there is no OBS connection or video encoder.

Human takeover suppresses autonomous overlays and has priority over ordinary scenes. When a takeover/emergency scene ends, the scene manager restores its previous valid semantic scene. Emergency clears overlays, stops the output, blocks new overlays, and requires reset. Reset reconnects the preview only when it was running before the emergency; it does not choose another product.

## Health, watchdog, diagnostics, and security

Health reports render counts/failures, last render time, scene, visible overlays, queue depth, and output state. The watchdog reports render failures, queue growth, unavailable output, takeover, and emergency. Output reconnect attempts after render failures are bounded to two until a successful render resets the budget. Diagnostics count scene changes, overlay creation/dismissal, semantic renders, output failures, and emergency stops; credentials are not included.

Renderer controls use the narrow preload API and strict `BroadcastControlSchema` over trusted Electron IPC. The renderer can request only named preview actions. Product lookup occurs in the main process against the local catalog. No filesystem, shell, credentials, arbitrary overlay HTML, browser automation, or platform control is exposed.

## Tests and limits

The Phase 9 suite includes 150 deterministic parameterized lifecycle/overlay cases plus focused tests for pricing, stock, promos, IPC validation, output failures, emergency, takeover, reset, and watchdog behavior. It requires no network, TikTok, Blender, camera, OBS, or external service.

This phase does not implement real streaming/video output, OBS automation, TikTok/TikTok Shop integration, Blender, a real 3D avatar, tracking, or external platform credentials. Source and local preview tests do not establish acceptance on a device or live platform.
