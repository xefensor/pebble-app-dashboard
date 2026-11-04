# Dashboard 0.1.0 local candidate

The tested installable artifact is `dist/Dashboard-0.1.0.pbw`, SHA-256
`b343905557e2c06a07dd2e55419305fdbe8c3ec91887fed4846cc5826c17890e`.
It targets Emery (200 × 228) and is not published. Source and resource hashes
from the debug bundle match the working tree; native emulator captures match
the exact native payload from this PBW. See [validation.json](validation.json).

| Check | Result |
| --- | --- |
| Node phone/protocol/settings tests | 53 passed (30 / 8 / 15) |
| Portable native parser/model tests | Passed; six JS-encoded fixtures |
| Actual packaged runtime frames decoded in C | 18 passed |
| C AddressSanitizer and UndefinedBehaviorSanitizer | Passed; LeakSanitizer disabled for sandbox ptrace compatibility |
| SDK 4.33.1 build and installable package checks | Passed; production excludes fixtures |
| Packaged phone and settings-plugin JavaScript | Passed with real Activities provider/consumer and isolated SDK model |
| Chromium phone settings | 13 behavior checks passed |
| Native Emery QEMU | 21 behavior checks passed; 26 native captures |

The native image footprint is 29,615 bytes against the 128 KiB app budget;
101,457 bytes remain available for the heap before runtime allocations. Packed
resources occupy 48,553 bytes against the 256 KiB limit. These are build sizes,
not measurements of physical-watch battery use or peak heap consumption.

## Evidence

- [Native Snapshot](native/snapshot-light.png), [Music controls](native/music-controls.png),
  [Activities](native/all-activities.png), [Pinned](native/all-pinned.png),
  [dark theme](native/snapshot-dark.png).
- [Native checks, screenshot hashes and harness provenance](native/emulator.json).
- [Packaged runtime checks and artifact hashes](packaged-runtime.json).
- [Phone settings checks](settings/validation.json) and
  [settings screenshot](settings/overview-light.png).

Native QEMU used a fictional protocol peer, with phone JavaScript removed from
its test-only PBW. The production PBW retains phone JavaScript; separate VM
checks executed its actual bundled scripts against fictional SDK sources and
actions. The native payload hashes establish that these screenshots came from
the candidate's native code and resources. Fictional home-light readings in
screenshots are test data, not installed production providers.

No real phone command, app launch, permission prompt or physical-watch session
was exercised. Device testing still needs to confirm phone permissions/provider
integration, associated app launches, readability, responsiveness and battery.
Dashboard Timer Pause/Resume remains deferred. Back uses standard PebbleOS rules.

## Reproduce

From the repository, with the SDK and Node environment available. Browser QA
requires Node 22+ and `/usr/bin/chromium` (or `CHROMIUM_BINARY`); native checks
require a C99 compiler and the emulator also needs Python Pillow/libpebble2:

```sh
source ../recovery-validation/env.sh  # Shared workspace SDK state/compatibility
npm ci --ignore-scripts
npm test
npm run build
npm run check:artifact
node scripts/generate-config.cjs --check
node scripts/check-packaged.cjs
python3 scripts/test-native.py --frames-dir build/packaged-frames
ASAN_OPTIONS=detect_leaks=0 python3 scripts/test-native.py --sanitize --frames-dir build/packaged-frames
node scripts/check-settings.cjs
python3 scripts/emulator-smoke.py
```

Emulator checks require this workspace's stock-derived QEMU support in
`../recovery-validation`. Reports and screenshots are regenerated locally.
Rebuilding can change SDK-generated timestamps and thus the PBW hash; compare
each fresh report with its actual build, rather than reusing this report.
