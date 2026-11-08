# Dashboard settings receipt freshness checkpoint — 2026-11-08

This local candidate supersedes the candidate in the [preferences checkpoint](ui-preferences-checkpoint.md). No version change, push or publication.

## Change

A fresh native hello reporting different settings invalidates the earlier receipt. Runtime resync and explicit Retry now persist a new wire revision before sending. A delayed receipt from before that invalidation cannot mark the new attempt Applied on watch. If revision storage cannot be verified, delivery stays pending and old timers and callbacks cannot restart it. Desired choices remain saved on the phone.

## Candidate and checks

`build/candidate/Dashboard-0.6.3.pbw` SHA-256:
`b224c94a9b70e8b288a0de69f038504483666485a7812fdd9b12fc692e98db76`.

- `npm test`, `npm run build` and `npm run check:artifact` pass. Focused controller regressions reproduce a mismatched native hello followed by an old receipt, repeated Retry, and failed metadata storage with late transport callbacks. The earlier application and ownership checks remain in the suite.
- The exact optimized packaged PKJS and plugin pass `python3 scripts/emulator-preferences-bridge.py` against the candidate native payload in Emery firmware 4.45.0. Evidence: `build/qa/preferences-bridge/1794164397527508642/report.json`. Phone storage/SDK calls are simulated; native transport and persistence/readback/application receipts run in QEMU.
- `build/qa/revision-payload-equivalence.json` proves native code, data, resources and generated configuration HTML unchanged from the preceding candidate. Native binary differences are confined to resource timestamp bytes 0x7C–0x7F; manifest build metadata also changes. The earlier native rendering matrices therefore cover the same native code/resources. The earlier Chromium screenshots cover unchanged HTML; this follow-up does not claim a new browser run.

SDK 4.33.1 / CLI 5.0.40, Node 26.12.0 / Python 3.13.16. The documented Node 22 / Python 3.12 runtimes and physical phone/watch remain unavailable. Published-build upgrades remain in the cross-project stage.
