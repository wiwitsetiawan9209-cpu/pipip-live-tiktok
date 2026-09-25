# TikTok Connector — Phase 10

## Status

- **IMPLEMENTED:** desktop OAuth 2 authorization-code flow, PKCE S256, one-time CSRF state, loopback callback, main-process token exchange and refresh, encrypted credential storage, profile lookup, scope reporting, capability report, safe IPC, and desktop status/control panel.
- **CONFIGURED:** no. This checkout contains no registered TikTok app values by default.
- **AUTHORIZED:** no live account authorization has been performed in this environment.
- **NOT_APPROVED / NOT_AUTHORIZED:** cannot be inferred from code; app review and user grants must be checked in TikTok's developer/account surfaces.
- **NOT_VERIFIED:** creator authorization, showcase, LIVE product, affiliate product, and QR access.
- **NOT_SUPPORTED in this phase:** TikTok LIVE control, TikTok Shop actions, product pinning, checkout, payment, OBS, browser automation, and scraping.

## Architecture

Renderer calls a fixed set of no-payload IPC operations. The Electron main process owns `TikTokConnector`, its API client, callback listener, and encrypted credential store. The preload returns status/account/capabilities only; tokens, authorization codes, client secrets, and PKCE verifiers never enter renderer state or Live Runtime. Live Runtime receives only an observational connection enum. Product Engine remains the source of truth for host product facts.

## Official API boundary

The implementation uses TikTok Login Kit desktop authorization and the official v2 token and user-info endpoints. It requests the explicitly configured scopes; default is `user.info.basic`. The official Display API supports profile/video data and does not establish Shop/showcase/LIVE product access. No undocumented endpoint is called. Recheck current official documentation and app approval before adding any API capability.

## Configuration and redirect

Set these in the **Electron main-process environment** before launching the app:

```powershell
$env:TIKTOK_CLIENT_KEY = '...'
$env:TIKTOK_CLIENT_SECRET = '...'
$env:TIKTOK_REDIRECT_URI = 'http://127.0.0.1:43219/callback/'
$env:TIKTOK_SCOPES = 'user.info.basic'
npm run dev
```

Register the exact redirect URI (including port and `/callback/`) in the TikTok developer app. The config validator accepts `localhost` or `127.0.0.1`, an explicit port, the fixed callback path, and no query/fragment. Do not put credentials in renderer variables such as `VITE_*`, source files, committed `.env` files, logs, or tickets. The app does not choose a redirect URI or silently expand requested scopes.

## OAuth, state, and PKCE

Each attempt creates a fresh random `state` and code verifier. PKCE uses `S256` with the SHA-256 digest encoded as lowercase hexadecimal per TikTok's desktop Login Kit instructions. State is one-time, expires after five minutes, and binds the configured redirect and requested scopes. The callback server binds only `127.0.0.1`, accepts only a loopback GET to `/callback/`, has a configurable bounded timeout, and returns a generic no-store page without echoing callback query data. The authorization code is exchanged in the main process and is never returned to the UI.

## Token lifecycle and storage

Electron `safeStorage` encrypts the credential record before it is atomically written under the app user-data directory as `tiktok-credentials.bin`. If platform encryption is unavailable, the connector refuses token writes. The API client uses request timeouts. Access tokens refresh five minutes before expiry; concurrent refresh calls share one promise and rotated credentials replace the stored record. Disconnect cancels refresh scheduling, clears in-memory account/profile state, and removes local credentials. Disconnect does not claim remote token revocation.

## Identity, scopes, and capabilities

After token exchange, granted scopes are read from the token response; they are not assumed equal to requested scopes. If `user.info.basic` is granted, the connector requests only `open_id,display_name,avatar_url`, then checks the returned `open_id` against the token identity. The UI shows the display name, abbreviated Open ID, requested/granted/missing scopes, and capability reason/status. App approval cannot be established just from a successful local build.

## Product sync and mapping

The product sync button currently reports `NOT_VERIFIED` and performs no TikTok product request or Product Engine write. No showcase, affiliate, LIVE-product mapping, or product fact is invented. Local catalog facts remain unchanged on unsupported/unavailable sync. Any future official commerce API work must introduce an explicit reviewed mapping and reconciliation policy before syncing data.

## Errors and rate behavior

Errors are normalized and sanitized. Profile GET requests have a two-retry maximum for HTTP 429 and 5xx responses with capped exponential delay and a capped `Retry-After`; token exchange/refresh POSTs are not automatically retried because authorization codes and rotating refresh tokens are single-use-sensitive. All requests have a timeout. There is no polling against TikTok; the local UI polls only the connector's in-process status.

## IPC and UI

Safe operations are status, begin/cancel authorization, local disconnect, refresh/validate, capabilities, product-sync status, and account. There are no IPC methods for tokens, client secret, code, or verifier. The UI presents TikTok connector state separately from local broadcast preview; it does not show or control a TikTok LIVE session.

## Testing

`tests/phase10-tiktok-connector.test.ts` contains 200 table-driven authorization URL scenarios plus deterministic cases for config, redirect validation, PKCE, state, encrypted storage, scopes, API response validation, rate limits, error redaction, capability honesty, product-sync non-mutation, status secrecy, and disconnect. No production credentials or real TikTok account is needed. `npm test` does not call TikTok production APIs.

A live OAuth test is not automated. It requires a registered/approved developer app, valid main-process environment variables, an exact registered redirect, and a user completing TikTok's consent screen.

## References

- [TikTok Login Kit Desktop](https://developers.tiktok.com/docs/en/login-kit-desktop)
- [TikTok Login Kit Overview](https://developers.tiktok.com/docs/en/login-kit-overview)
- [TikTok User Access Token Management](https://developers.tiktok.com/docs/en/oauth-user-access-token-management)
- [TikTok Display API Get Started](https://developers.tiktok.com/docs/en/display-api-get-started)
- [TikTok Get User Info](https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info)
- [TikTok QR Authorization](https://developers.tiktok.com/docs/en/login-kit-qr-code-authorization)
