# Unavailable Snapshot checkpoint — 8 November 2026

The published-build upgrade check exposed a native presentation regression:
Snapshot's ScrollLayer was hidden whenever the overall source status was
Offline, Permission or Error, even when configured pins were present. The
canvas reserved that area for the ScrollLayer, leaving an empty body. The
published build kept the pin panels available.

The visibility condition now matches the canvas's existing empty-state rule:
show the measured Snapshot when data is ready and either the status is normal
or items remain. Unavailable readings keep their existing presentation and
capability checks. This does not restore withdrawn data or grant an action.
No protocol, persistence, provider identity or source expiry changed.

Final candidate: `build/candidate/Dashboard-0.6.3.pbw`, SHA-256
`8dac68333b521f676b5c72f46f4188d18a5dd18d2a27e5e2bf7ebbdc49a8cf22`.
This supersedes the candidate in the [receipt checkpoint](ui-preferences-revision-checkpoint.md).

- The new `scripts/emulator-unavailable-snapshot.py` reproduces the old failure
  at actual OS Small / Offline. With the final native payload it passes Ready,
  Offline, Permission and Error at all three actual OS sizes on both Emery
  4.33.2 and 4.45.0: 24 cases. Each unavailable body matches the corresponding
  ready body's pixels with identical unavailable pins. Large fits the same
  content through the measured ScrollLayer.
- `npm test`, `npm run build`, `npm run check:artifact` and
  `npm run check:config` pass.
- The exact final phone/native preference bridge passes on 4.45.0, including
  all three manual sizes, exact native application receipts and relaunch.
  Its ACK bookkeeping now holds a lock over send/registration so a fast SDK
  ACK cannot race the test harness's transaction map.
- `build/qa/unavailable-snapshot-equivalence.json` proves packaged plugin,
  PKJS, HTML and resources unchanged. The native visibility branch changed;
  this is not a claim of identical native instructions. Earlier browser
  evidence covers the same HTML, and earlier native suites retain their
  explicitly recorded candidate hashes.

Evidence: `build/qa/unavailable-snapshot-{4.33.2,4.45.0}/report.json`,
`build/qa/preferences-bridge/1794170313123982153/report.json` and
`build/qa/unavailable-snapshot-before-after.png`. These are exact native
emulator checks with synthetic DSH1 data or simulated phone SDK/storage,
not physical phone/watch tests. The cross-project upgrade report checks the
final candidate over the published 0.6.3 PBW with the saved phone pins.

Reproduce with the documented Pebble SDK environment:

```sh
python3 scripts/emulator-unavailable-snapshot.py
```

Set the existing firmware environment variables for the 4.45.0 run. No release,
version bump, push, SDK change or publication was made.
