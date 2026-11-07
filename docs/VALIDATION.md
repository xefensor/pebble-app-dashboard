# Dashboard validation

## Development localization — 8 November 2026

The development checkout supports 17 languages for native screens and phone
settings. English fallback, regional/Norwegian aliases, placeholders, saved values
and provider text are covered by portable checks. The native resource reader is
bounded, loads only the selected locale, and falls back safely after incomplete
or malformed reads. No protocol identities, permissions or saved bindings change.

The SDK 4.33.1 build, packaged execution, exact resource/glyph and measured
control/help/warning/header-width checks pass. Candidate SHA-256:
`944fa98d9f47494275e8f0adc659dbc871363e340dca674c07c1f2007744d7d7`.

Fresh Emery QEMU review contains 5 captures across English, Czech, French and
Finnish, including Czech light/dark. Disposable variants fix the SDK locale getter;
Dashboard's dark guide also fixes its saved-theme preference. These exercise the
normal native entry point and input, without a phone runtime. Phone controllers
save and reopen correctly across all 17 languages. Fresh Chromium/Firefox startup
remains sandbox-blocked; no physical phone/watch test is claimed. Current evidence
is in ignored `build/qa/localization/`; frozen release/QA evidence is untouched.
