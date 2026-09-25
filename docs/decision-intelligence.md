# Phase 12 — Decision Intelligence + JEv

## Architecture and authority

`packages/decision-intelligence` provides typed requests/results, deterministic routing, confidence handling, a short-lived structured cache, a JEv provider, local fallback, conceptual LLM routes, a Tool Gate, an Output Judge, and privacy-safe metrics. The autonomous audience path calls it before optional knowledge lookup and before `HostEngine`; `HostEngine` and the existing policy/Product Engine validation remain in place. Rejected output is not emitted as a host response, so it cannot enter the downstream speech/avatar/broadcast event path.

Emergency stop, human takeover, security/policy checks, and verified Product Engine facts retain authority. JEv returns a route suggestion only; `toolAllowed` is always false for JEv responses, and the orchestrator does not execute a JEv or LLM tool action. The Tool Gate is available for bounded runtime action validation, but this project currently exposes no LLM tool-execution path.

## JEv discovery and provider

Repository/dependency/config inspection found no pre-existing JEv SDK, integration, or `TYPESAFE_API_KEY`. The official TypeSafe documentation identifies the JavaScript package `@typesafe-ai/sdk`, `TypeSafeClient`, API endpoint `https://api.typesafe.ai/v1/systemone`, bearer authentication, model `jev-latest`, a `state` plus `questions` request, and structured `answers` with choice and confidence fields. The SDK documentation describes per-attempt timeout and retry settings. See the [official quick start](https://docs.typesafe.ai/introduction/quickstart), [JavaScript SDK guide](https://docs.typesafe.ai/sdk/javascript), and [client configuration reference](https://docs.typesafe.ai/sdk/javascript/api/interfaces/TypeSafeClientConfig).

The optional provider uses the documented SDK, structured choice questions, `TYPESAFE_API_KEY`, a 500 ms per-request timeout, and zero SDK retries so the caller's bounded timeout can trigger local fallback. The application does not send a request when the key is absent. Integration tests use an injected mock client; no live credentials were available and no real JEv request was made. The package is a hard dependency at install time, but JEv is optional at runtime: removing its credentials leaves deterministic fallback and the existing local AI route active.

## Deterministic routing and fallback

Emergency/stop/takeover states are handled before provider calls. Spam, abuse, off-topic, low-value reactions, complaint escalation, price/stock facts, greetings, jokes, comparisons, recommendations, and unknown intents have explicit routes. Price and stock decisions are served from the verified catalog; when the event cannot resolve a catalog product, the orchestrator declines to improvise and escalates without generating speech. This phase does not add a fuzzy Product Engine lookup API.

When JEv is absent or fails/times out, a deterministic provider routes the event to a local conceptual route or escalates. The system remains usable without JEv. `LLM_FAST` and `LLM_STRONG` describe routing intent; both resolve to the same configured Ollama model (`pipip:live`) in this installation. No new model name is assumed.

Confidence is bounded to `[0,1]`: values at or above 0.90 pass; 0.70–0.89 queue for validation; below 0.70 escalate. Invalid values reject the provider result. Confidence never overrides policy, verified product data, emergency stop, or human takeover.

## Tool Gate, Output Judge, and product protection

The Tool Gate checks action allowlisting, product existence/validity, runtime availability, policy permission, emergency stop, and human takeover. It does not execute the action. `SHOW_PRODUCT` is denied without a valid existing product.

The Output Judge rejects empty or unsupported commercial claims. It composes with the existing `ProductClaimPolicy` for catalog-backed responses and rejects unverified price, stock, promotion, and guarantee claims. It runs before audience response events are emitted; the voice engine receives only validated host events. Existing `HostEngine` ProductClaimPolicy validation also remains active.

## Latency, cancellation, cache, and security

Decision latency defaults to 500 ms (configurable in the class, bounded to 50–5000 ms). Provider calls are raced against this timeout; timeout falls back locally. Disabling the feature, stopping, pausing, emergency stop, or takeover cancels pending work where the provider honors `AbortSignal`. The cache has a five-second default TTL and stores only structured decisions with no audience text; emergency/takeover clears it.

Decision inputs redact common credential patterns and bound text/action fields. JEv credentials are consumed in the Electron main process and are not returned through status IPC. Renderer status contains only configuration/state booleans, route/model names, and aggregate metrics. Metrics retain only counters and bounded latency samples; audience text, account identity, API keys, and tokens are not metric fields. Phase 10 TikTok authentication and connector code were not changed.

## Desktop controls and metrics

The AI Host panel shows enabled state, JEv availability, current route, event/provider/fallback/deterministic/LLM/ignored/rejected/escalated/failure counts, mean and p95 latency, and the configured model mapping. The operator can turn Decision Intelligence off; this disables the optional provider path and clears pending decisions/cache while deterministic routing, Product Engine protection, policy validation, human takeover, and emergency stop remain active.

## Dead air and known limitations

The Phase 5 Show Director remains authoritative for timing, cooldown, queue, and scheduled actions. Phase 12 does not use JEv as a scheduler and does not yet route dead-air topic/music choices through Decision Intelligence. Audience comment routing is integrated; other event families are not yet connected. Existing `HostEngine` has one configured model, so FAST and STRONG currently share it. Tool actions are validated by the standalone gate but no tool execution is exposed. Live JEv behavior, desktop operator walkthrough, physical hardware, TikTok, avatar rendering, and broadcast delivery were not tested as part of this phase.
