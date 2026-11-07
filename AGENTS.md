# Dashboard maintainer instructions

## Scope

Work on the existing stock-PebbleOS implementation; preserve accepted behaviour and public compatibility.
Read [CONTRIBUTING](CONTRIBUTING.md) for setup, output locations and commit/release policy.
The accepted app UI is on main. Older candidates, QA records and source archives
remain frozen; history is not a second active specification.

## Important boundaries

Preserve DSH1 identities, session/token/version checks and exact command bindings. Never persist private activity/notification content. Keep one activity, notification and two pins in Snapshot. Readings and independent commands are distinct capabilities. Zero is not owner completion. Default pins do not gain implicit actions or app bindings. Cancel is the initial confirmation choice. Source removal/expiry invalidates capability immediately according to the existing lease.

## Read only what the task needs

- Ownership, storage, source lifecycle, privacy or capabilities:
  [current maintenance contracts](docs/MAINTENANCE.md).
- Native layout, typography, icons or interactions: [current UI](docs/UI.md).
- Versioning, archives, tags, upload or deployment: [release boundary](docs/RELEASING.md).

## Work and verification

Respect research/review versus implementation scope. Preserve established user
choices; clarify materially different interpretations before changing direction.
Run relevant required checks. Tests alone do not judge visual quality. Keep
source/portable tests, packaged execution, native emulator and real-device
verification distinct. Use disposable development evidence; do not overwrite
historical proof or relabel it as fresh.

`npm test` runs portable source tests and workflow guards. `npm run build`
creates a disposable candidate; it must not replace frozen dist/release files.
Do not bump versions or create release archives for routine edits. Never push,
publish or deploy as an implicit part of testing. Keep instructions current;
put superseded decisions in [history](docs/history/maintainer-notes-before-rework.md).
