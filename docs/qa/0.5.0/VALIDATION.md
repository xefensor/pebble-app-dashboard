# Dashboard 0.5.0 validation

Status: **local candidate; not pushed or published**. The PBW and matching debug
archive are in `dist/`; earlier released artifacts and tags are unchanged.

## Result

- `npm test`: portable JS runtime/settings/protocol and C model/deadline checks pass.
- `node scripts/generate-config.cjs --check`: generated page matches its source.
- `npm run build` and `npm run check:artifact`: final SDK package passes identity,
  plugin/config/permission, font/license, dependency and fixture-exclusion checks.
- `node scripts/check-packaged.cjs`: actual archived phone/plugin scripts execute
  against the isolated SDK model and pinned Activities consumer/provider.
- `node scripts/check-settings.cjs --pbw dist/Dashboard-0.5.0.pbw`: **36 browser
  checks and 14 screenshots** use the actual archived page. The real source
  config/PKJS handlers model separate Android native and DOM stores, full reload,
  teardown, late replies and saved Weather bindings. English and Czech Save,
  validation, no automatic text focus, persistent Saved feedback, scroll position
  and 32px body text at a 320 × 400 viewport pass.
- Native Emery UX: **18 captures and 9 behaviour checks**. Collections retain
  readable position plus local time; status/app hints leave both pins visible.
  Confirmations start on Cancel and only explicit Down/Select confirms the
  original request. Generic sparse controls and selection safeguards pass.
- Native Emery startup appearance: **15 captures and 6 behaviour checks** cover
  first launch, saved dark/light, wrong requests, loading timeout, offline
  relaunch and accepted theme changes.

All artifact-bound reports identify the same final PBW SHA-256 recorded in
[validation.json](validation.json). Native payloads are exact copies of that
package; only the explicit phone peer is fictional. The SDK reports 33,147 bytes
of native RAM footprint, 97,925 bytes of free heap and 71,219 resource bytes.

## Design evidence

- [Clock with activity count](native-ux/activities-title-count-clock.png)
- [Clock with pin count](native-ux/pinned-title-count-clock.png)
- [Failure keeps clock and both pins](native-ux/second-pin-failure.png)
- [Cancel-first confirmation](native-ux/confirmation-target-sidebar.png)
- [Explicit Run choice](native-ux/confirmation-explicit-run-choice.png)
- [Dark Snapshot after reconnect](native-theme/startup-first-valid-dark-after-reconnect.png)
- [English phone settings](settings/overview-light.png)
- [Czech settings](settings/overview-czech.png)
- [Persistent Czech Saved status](settings/saved-czech.png)
- [Czech enlarged-text viewport](settings/czech-large-text-small-viewport.png)

The phone accent uses teal `#076b65` on light surfaces and `#83d7ca` on dark
surfaces. Measured primary button contrast is recorded in `validation.json`.
The page supports English and Czech; unsupported locales use English. User and
provider content retains its own text, language and exact binding identity.

## Limits

This is automated browser, packaged SDK-model and native-emulator evidence.
It does not establish a live Android phone's WebView/permission/storage behaviour,
physical watch readability, button feel, vibration or battery life. The legacy
return-URL page still closes to submit; only the modern bundled page implements
confirmed in-page Save. Dashboard Timer Pause/Resume remains deferred.
