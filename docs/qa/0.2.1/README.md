# Dashboard 0.2.1 local candidate

The notification row stays selectable when there is no current preview. Select
opens native Notifications. Disabling previews stops message subscriptions while
keeping this public app shortcut. A real notification and the empty shortcut
share one row identity so navigation does not skip or lose the row on withdrawal.

Private sender/body/artwork are cleared on withdrawal, permission loss or expiry.
The public shortcut contains only fixed app labels and a destination; it does not
claim to represent the native app's full notification history. Expired private
bindings remain inert until the phone supplies a current public shortcut.

The installable PBW is `dist/Dashboard-0.2.1.pbw`. See
[validation.json](validation.json) for the exact artifact/source hashes and test
results, [packaged runtime checks](packaged-runtime.json) and
[focused native emulator checks](native/emulator.json). Native screenshots use
the candidate's unchanged native payload with a fictional phone peer; packaged
JavaScript runs separately against isolated SDK sources/actions. No live phone
action, physical-watch test or GitHub publication is implied.

Verified PBW SHA-256:
`75f90917c512f669bc5b5ea75ed5d6d8cae9100fdd074c449df755335dac9e36`.

| Check | Result |
| --- | --- |
| Node phone / protocol / settings tests | 60 passed (36 / 9 / 15) |
| Portable C and ASan/UBSan | 12 fixtures and 30 actual runtime frames passed |
| Packaged JavaScript / artifact / generated config | Passed |
| Focused native Emery QEMU | 6 checks passed, 7 reviewed captures |
| Artifact, built source, native payload and screenshot hashes | Matched |

[Selected empty row](native/empty-notifications-selected.png) ·
[No active activity](native/empty-notifications-no-activity.png).

## Reproduce

```sh
source ../recovery-validation/env.sh
npm test
npm run build
npm run check:artifact
node scripts/generate-config.cjs --check
node scripts/check-packaged.cjs
python3 scripts/test-native.py --frames-dir build/packaged-frames
ASAN_OPTIONS=detect_leaks=0 python3 scripts/test-native.py --sanitize --frames-dir build/packaged-frames
python3 scripts/emulator-smoke.py --notifications-only
```

The emulator requires this workspace's SDK/QEMU support. LeakSanitizer is
disabled for sandbox ptrace compatibility. Earlier layout/full-suite emulator
evidence remains under `../0.2.0`; this revision focuses on the empty shortcut,
its app request and private-content transitions.
