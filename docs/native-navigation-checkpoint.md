# Native navigation checkpoint — 2026-11-08

Local candidate; no push, release or SDK/minimum-firmware change. Starting Dashboard main: `e0b093267caa5c6667c9695433f17aa103737560`.

The development UI uses six app-owned Windows, measured native MenuLayers and a measured custom Snapshot in ScrollLayer. The guide and long action context remain scrollable. All watch text uses actual PebbleOS system roles, with the complete measured local clock and unchanged 34 px action rail.

Shared UI source: `b67370a`; the archive hash and installed source identity are recorded in `vendor/UI.json`. The package is a local native-type candidate, not a new published 0.1.1 release.

## Automated and packaged checks

`npm test`, `npm run build` and `npm run check:artifact` passed. The portable press checks cover identity/version/view/session/focus changes, latched cancellation, reordering and exactly-once consumption. All existing native parser/deadline, phone/runtime, settings, workflow and release-fixture checks passed. Node 26.12.0 / Python 3.13.16 were used; exact contributor runtime pins were unavailable. SDK 4.33.1 / CLI 5.0.40, bundled Emery firmware v4.33.2, matching Timer’s SDK reference.

Candidate: `build/candidate/Dashboard-0.6.3.pbw`.
SHA-256: `647ce74573fdf3e2172ef37ac2bcf091b4e0c4409bb3a085fc3717e1bf6fc765`.

Exact native payload:

- `emery/app_resources.pbpack`: `7ea93b3ed472f7920c0292d3d07f8f3e2f2f22c959d6f311c673080bb184ad8f`
- `emery/manifest.json`: `6043456d17ee61f39630f2d2b50b271edf32362d97854d74de34a4c045300e27`
- `emery/pebble-app.bin`: `64e2373aa73e241bc253d3151bdc8a33b024a5fd88d8dc3f74417f6f4872f292`

## Native emulator checks

The exact candidate passed the full DSH1 synthetic-peer run: 82 captures and 34 checks. This covers source identity/version/session, holds and previews, independent actions, safe confirmation, sparse controls, live insertion/removal, paging, timeout/recovery, permission/expiry, private-content redaction and disconnect/reconnect. No phone JavaScript or real provider action ran in this native harness.

The held-Select/control-focus chord now cancels the entire press. Safe confirmation rechecks the original request and capability. Ordinary tests wait for the newly opened Window before pressing Cancel; the separate fast-input checks retain their no-wrong-target requirement. No timing delay was added to production input handling.

The size run changes the real OS preference and relaunches. It uses identical frozen timer values and source labels at each size, measures loaded rows, navigates the fifth item and next page, reverses, restores identity on Back, verifies long command labels and Cancel-first confirmation, and checks held entry presses. Raw push/pop samples and native menu GIFs preserve original pixels. There are 84 raw captures per size/locale run.

| OS size | API preference | First standard row | Complete equivalent standard rows in 192 px |
| --- | --- | --- | --- |
| small | 1 | 58 px | 3 |
| medium | 2 | 64 px | 3 |
| large | 3 | 68 px | 2 |

Czech and German locale-lookup fixtures passed the same three OS sizes and native flows. They are separately hashed binaries, not proof of installed OS language packs. The shared type table matches the independently pinned original and 4.44 font tables; Timer’s direct-SDK specimens supply the same-firmware font/motion reference.

The separate diagnostic fixture logged actual OS preference/effective indices 1/0, 2/1 and 3/2. Across repeated stacked-window paths its minimum UI heap was 47868 bytes; last 20 samples ranged 47948–47984 bytes. SDK exit logs reported zero outstanding allocations in exact-candidate and fixture runs.

Disposable reports and captures:

- `build/qa/native-full-current/emulator.json` — PASS, PBW `647ce74573fdf3e2172ef37ac2bcf091b4e0c4409bb3a085fc3717e1bf6fc765`
- `build/qa/native-sizes-current/emulator.json` — PASS, PBW `647ce74573fdf3e2172ef37ac2bcf091b4e0c4409bb3a085fc3717e1bf6fc765`
- `build/qa/native-sizes-cs-current/emulator.json` — PASS, PBW `a54c6805df3e9baeda39420468305a7b2ef4483215c7ffb17fa2a772520d19b6`
- `build/qa/native-sizes-de-current/emulator.json` — PASS, PBW `0c29ac0ecaad1bec4c1824a27f08aac8fd9fefe5850bfe5f4b9d4cd16778665c`
- `build/qa/native-sizes-heap-current/emulator.json` — PASS, PBW `a5f43e1add78ccef6670725ae17b1571de864e354adfff0e9e708282e0d600c1`

The reports bind every raw capture and native payload. `native-size-collections.png`, `large-locales.png`, native window push/pop GIFs and `native-menu-motion.gif` provide comparison boards/sequences. Representative settled layouts, all three sizes and Large action/confirmation text in English/Czech/German were visually inspected.

## Pending

Per-project text/appearance overrides and watch-confirmed preference delivery remain a separate stage. Later supported firmware, installed language packs, real notifications/Timeline cover and physical Time 2/phone behavior remain unverified here. On a device: repeat all three Text Size choices; check complete headers and long controls; enter/leave both collections with holds; test Select during refresh and a direction/Select chord; disconnect/reconnect and verify private content clears and exact actions recover. Check native touch on/off if enabled by that firmware. No paired device was exposed in this session.
