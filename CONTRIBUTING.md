# Developing Dashboard

## Setup and normal work

Use Node 22+, Python3 and the Pebble SDK 4.33.1 on PATH for SDK builds.
Portable tests do not need an SDK, a phone or a watch.

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run check:artifact
```

Development outputs live under `build/candidate/`; QA output defaults to `build/qa/`. Frozen files under `dist/`, `releases/` and library root `dist.zip` are release snapshots.

| Task | What to read/check |
| --- | --- |
| Everyday source change | Run relevant source/native tests; use npm test for the complete portable suite. |
| Implementation boundaries | Read docs/MAINTENANCE.md for the affected ownership, compatibility or privacy boundary. |
| UI change | Read docs/UI.md; build a candidate and inspect the affected real native compositions. |
| Release/publication | Read docs/RELEASING.md. Release preparation is explicit; it is not part of every edit. |

## What counts as done

Make the requested coherent change, run relevant required checks, and report the
result and material gaps. Broaden verification for an actual failure or unresolved
risk; do not automatically repeat every historical QA suite. SDK/native changes
need a current packaged build; visual work needs actual inspection. Do not claim
fresh browser/device evidence from source checks or an old report.

## Output and commit policy

Ordinary work does not bump a version, produce source/debug release archives or
publish anything. A candidate contains the installable runtime and notices and
can be inspected independently of frozen artifacts. Candidate fingerprints reject
stale source or modified bundles. Finish a coherent authorized change in a local
commit when appropriate; do not push, tag, upload or deploy without explicit scope.

## Explicit QA inputs

Python/app checks use `PEBBLE_PBW` to select a particular PBW. Set
`PEBBLE_QA_OUTPUT_ROOT` to choose an evidence root; ordinary captures otherwise
stay under build/qa. Tools with --pbw/--output retain those explicit arguments.
To examine frozen artifacts, use their recorded source commit rather than
pretending current source is their original snapshot.

## Repository map

src/c/dashboard.c owns the portable DSH1 state; dashboard_deadline and dashboard_layout own expiry/layout policy; main.c integrates the SDK and renders. src/pkjs owns discovery, capabilities, commands and settings.

[Current maintenance contracts](docs/MAINTENANCE.md) · [Release boundary](docs/RELEASING.md) ·
[Historical maintainer notes](docs/history/maintainer-notes-before-rework.md)

Historical review reports and source archives are tied to the UI merge commit,
not later maintenance commits. docs/UI.md records that snapshot.

[Repository maintenance validation](docs/qa/repository-rework-2026-11-07/validation.json)
records the preserved baseline and this pass’s checks.
