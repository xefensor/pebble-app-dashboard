# Dashboard 0.4.3 settings persistence and focus

Local candidate on `fix/settings-save-0.4.3`, based on
`837f445d6f18c3d74deb9b62946882c4b02b35d6`. No publication is implied.

Two defects were reproduced. The [archived 0.4.2 browser record](before-weather-save.json)
shows that choosing Weather and pressing global Save while the pin editor is
open does nothing because Save is disabled; reopening loses the destination.
Done then Save works in that fixture. The same record shows automatic focus on
the name field. Separately, the actual PKJS/plugin regression uses Android's
distinct DOM/native storage views: a plugin save succeeds, reload reads old DOM,
and SDK teardown overwrites the new Weather binding. A shared Map masks that
second defect. Pinned primary SDK sources are in
[APP-PICKER.md](../../APP-PICKER.md#saving-an-edited-destination).

Global Save now gathers and validates the open pin without requiring Done. It
does not mutate the draft or close the form before an acknowledgment. Active
PKJS owns live saves so its DOM and native storage agree; closed settings use
the plugin. Current targets govern bounded handoffs. A still-live failed PKJS
write cannot silently fall through to the plugin. Responses must contain the
exact normalized candidate. Errors retain the form and do not claim success.
Done/Add pin remain optional local draft steps. No programmatic focus calls
remain; quick setup and result selection scroll without opening a keyboard.

| Check | Result |
| --- | --- |
| JavaScript | 91 passed, including three separate-storage/atomicity/lifetime regressions |
| Portable native | Two suites using 16 encoded fixtures passed |
| Production SDK build and artifact validation | Passed; RAM 32,666 bytes, resources 64,208 bytes |
| Actual packaged phone/plugin JavaScript | Passed, including active settings save and plugin readback |
| C decoder on actual packaged runtime output | 33 frames accepted |
| Chromium on final archived config.html | 34 check groups / 11 captures passed |

[Browser validation](settings/validation.json) records complete page reloads for
both the closed plugin route and active PKJS route. The latter also simulates
SDK DOM-to-native teardown before reopening. Weather's exact UUID, destination
label, reading and edited pin label survive; delayed catalogue responses do not
reset them. The record verifies no automatic text focus on Add/Edit/reopen,
invalid destination validation with no writes, a refused live PKJS save with no
unsafe plugin fallback, retained fields, and successful retry. The independent
unit cases also reject malformed settings atomically and preserve terminal stop
without starting watch/source work.

Root visually reviewed [Weather after reopening](settings/weather-after-save-reopen.png).
The destination remains selected and the captured focus is BODY rather than an
input. The browser uses fictional metadata/actions and intercepted store XHR;
actual config handlers run against separate modeled storage views. It is not a
live phone or a physical-watch test.

Native C, resources, permissions, plugin manifest and plugin.js are unchanged
from 0.4.2. Native executable bytes differ only in the SDK resource timestamp
field at offsets 124–127; all code/data/relocations match. No emulator run was
needed for this phone/settings change. All 27 earlier PBW/ZIP artifacts retain
their hashes. See [artifact identity](artifact-check.json) and
[previous artifacts](previous-artifacts.json).

PBW SHA-256:
`4996e8eb30fbdceb3c27d6d1829e3e8ebf551a939112202149eaecdfd3c33ef8`.
Settings HTML SHA-256:
`07f958fbfa649e55f963edb475e7fa3cd8b8d27234a7d5a4d2c98808867e7a29`.

```sh
source ../recovery-validation/env.sh
npm test
npm run build
npm run check:artifact
node scripts/check-packaged.cjs
python3 scripts/test-native.py --frames-dir build/packaged-frames
node scripts/check-settings.cjs --pbw dist/Dashboard-0.4.3.pbw
```
