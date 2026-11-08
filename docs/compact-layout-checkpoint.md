# Compact layout checkpoint — 2026-11-09

Snapshot uses four compact panels inside the actual below-header viewport.
Complete values/units reserve width before labels. Activity support, then the
notification preview, receive any remaining line budget. Selection never scrolls
Snapshot; collections and details retain their native scrolling. Oversized atomic
values show the existing localized Too long label. Fonts and contrast stay native.

Candidate: `build/candidate/Dashboard-0.6.3.pbw`

SHA-256: `4a8932c45bdbf25f1730b45465b5dba7076470de1b3ec868a61fe72d1bdfa07e`.

`npm test`, `npm run build`, `npm run check:artifact`, `npm run check:config`
and `npm run check:docs` passed. `scripts/emulator-compact-snapshot.py` checks all
four selected panels, live value changes and overflow at Small/Medium/Large,
light/dark and English/Czech/German source labels. Its 108 native screenshots and
hash-bound report are in `build/qa/compact-snapshot/`. The additional unavailable
snapshot regression passed all three sizes and four source statuses in
`build/qa/compact-unavailable/`. Long source labels are synthetic; app translations
follow the actual emulator locale.

Source checks use the available Node 26.12.0 / Python 3.13.16 and the existing
workspace recovery environment; the exact contributor runtime pins were not
available. Native builds use SDK 4.33.1 / CLI 5.0.40. Emulator firmware is v4.33.2.
No physical watch, real paired phone/provider, or actual Czech/German language
pack was tested. Candidate versions and public identities remain unchanged.
No release, push or publication is part of this checkpoint.
