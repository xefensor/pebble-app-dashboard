# Dashboard 0.6.1 local readability review

Final local candidate on `design/pebble-native-redesign`, based on 0.6.0 at
`f5a632d`. No push or publication. Main and all tracked 0.6.0 artifacts retain
their bytes. Xef's correction drove the full composition: coherent readable
font roles, ink-centered text/icons, stationary full-width selection, and
readable density rather than forced row count. See ../../REDESIGN.md.

Final PBW SHA256:
`6158c5d67bd2c6b53bea588be2a715ae7122c77d8532544f27783e3b0899b182`

## Final checks

- **94 JavaScript tests** pass, including settings Boolean mapping, validation,
  draft/storage lifecycle, privacy, capabilities and source/runtime regressions.
- Portable native model passes 16 binary fixtures plus malformed/stale/privacy/
  sparse-control/clock cases. Deadline tests retain one unchanged timer and
  cover expiry/rebase/cancel/retry. Layout tests cover exact bundled accents,
  descenders/signed bearings/wildcard, fifth selection, reverse/page/Back,
  empty page and live-shrink backfill.
- Packaged identity, permissions, config, licenses and pinned library pass.
  Actual PBW phone/plugin JavaScript passes an isolated SDK model. This is not
  phone execution or a browser test.
- **Native Emery QEMU, exact final native bytes:** UX 56 captures/11 checks,
  Activities 16/5, reliability16/6. Fixtures exercise guide dismissal/restart,
  selected-pin feedback, independent unavailable commands, hold cancellation,
  exact app/action targets, Cancel-first confirmation, sparse controls, idle
  state, immediate stationary selection, bounded button return, accented local
  windows/page/Back, countdown zero and private expiry. All actions/opens are
  synthetic receipts; no actual source or app is controlled.
- **203 actual ink measurements across 31 unchanged native PNGs pass.** Maximum
  measured icon/text or whole-group center difference is 0.5px. Fully accented
  Snapshot has primary margins 2/2px and notice 3/3px. Both pins, notification
  heading/icon/body, primary caption/icon, Media title/artist/artwork/hint,
  normal and accented collection groups, selected generic controls and safe
  confirmation choices are measured. See layout-pixels.json for coordinates,
  margins and capture hashes; raw PNGs retain native 200×228 pixels.
- Exact PFO/header regeneration is identical, the resource pack matches the PBW,
  and debug source hashes match current native/resources. Each bundled utility
  font retains 920 glyphs including Czech accents and minus. Missing characters
  use the packaged wildcard; full language coverage/shaping is not promised.
- Resource size 141501 bytes/256KB; native RAM footprint 46130 bytes/128KB;
  reported free heap 84942 bytes. No physical battery/performance claim.

## Fit choices and evidence limits

The normal mixed Activities capture shows three readable rows. Shorter two-line
rows can show four, one-line rows can show five, and tall accent groups fewer.
The wire page remains five items. Selected fifth/reverse/page/Back behavior is
checked without changing source bindings or protocol. Snapshot retains activity,
notice and two pins. Numeric primaries allow 62px notices; Media/text primaries
cap them at 53px and explicitly use Open to read if an optional preview cannot
fit. Ordinary horizontal ellipsis remains; body roles do not shrink to force
more text.

Representative final compositions were inspected directly; the pixel script
independently measures 31 fixtures. Earlier composition4 captures are a labeled
appearance checkpoint, not final byte acceptance. The Gothic font study is
historical research; current production uses custom Roboto/Fredoka PFO bounds.

An early reliability capture arrived at 00:01 because host anchors and emulated
whole-second RTC/tick scheduling were not aligned. The isolated fixture now
sets its RTC to the peer anchor and permits one extra SDK tick. Final pixels
match the explicit zero reference before minute redraw, without inferring owner
completion. First-callback units/focus-loss cancellation are source-reviewed,
not instrumented in the production binary. This is not a physical timing test.
The collection theme probe was moved off its scrollbar, and paired Czech Media
captures now explicitly verify their light/dark theme.

Final whitespace cleanup was recompiled: the native binary differed only in
its SDK resource-build timestamp header bytes124–127; resources and every other payload were
identical except generated manifest metadata. The exact tested PBW was restored
byte-for-byte. Debug/source manifests reflect the clean source; the metadata
comparison is recorded in font-binding.json.

Phone changes are source-level CSS alignment only: button/select line height,
centered button labels and 10px summary padding. The generated actual-template
phone preview contains fictional data, blocked Save and no real storage/network.
New browser fitting is unavailable in this sandbox. Real Android WebView
persistence/permissions/provider behavior, physical-watch comfort/timing,
vibration and battery remain unverified. Existing confirmed Save/schema/source
ownership logic is unchanged.

## Reproduce

Use the workspace recovery SDK environment, then run npm test, npm run build,
npm run check:artifact and node scripts/check-packaged.cjs. Generate bundled
ink tables with python3 scripts/generate-body-ink.py, rebuild, then verify
resource/debug/table identity before binding captures. Native QA uses
scripts/emulator-smoke.py with --ux-only, --activities-only and
--reliability-only in separate output directories, then
python3 scripts/audit-layout-pixels.py. Package source only after final QA/docs
using scripts/package-source.py, and verify it with --check. Do not rebuild the
PBW after binding its hash without repeating affected native checks.
