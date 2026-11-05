# Dashboard 0.4.1 startup theme

Local candidate on `fix/startup-theme-0.4.1`, based on published documentation
commit `7297ca1ae77bd82e6410293259c3550d128e0b17`. No GitHub publication is implied.

The native app restores its last confirmed theme before creating the window,
then sets the native window background before pushing it. Loading, timeout,
offline and first-use screens share the same palette. Only an accepted DSH1
snapshot may update persistence key 2; key 1 remains the guide preference.
Unchanged accepted frames do not write flash. Failed writes leave the previous
saved value and can retry on a later accepted frame. No private content, source
binding, command or selection is persisted, and no polling or timer is added.

With no cached preference, including the first launch after upgrading from
0.4.0, startup defaults to light until the phone supplies settings. A setting
changed while Dashboard is closed likewise takes effect with the first accepted
phone frame; earlier frames can only use the previous confirmed preference.
Fixture builds ignore persistent preferences and cannot overwrite them.

Automated verification passed: 88 JavaScript tests, two portable native suites
using 16 encoded fixtures, the production SDK build and artifact validation.
The actual packaged phone/plugin runtime passed in an isolated fictional SDK;
its 30 emitted frames also passed the native C decoder. Native RAM footprint is
32,666 bytes and resources are 64,208 bytes.

[Artifact verification](artifact-check.json) ties the debug sources to current
source and verifies that phone JavaScript, plugin JavaScript, settings HTML and
native resources are byte-identical to published 0.4.0. Browser checks were not
repeated because the exact settings HTML is unchanged. All 21 earlier PBW/ZIP
artifacts in [the inventory](previous-artifacts.json) retain their hashes.

The [focused native run](native/emulator.json) passed six behavior checks with
13 unmodified Emery captures and ten exact palette/contrast samples. It used a
fresh isolated flash and the exact final PBW native bytes with a fictional
AppMessage peer. Dark and light both survive process relaunch with phone frames
withheld, the six-second loading timeout and offline relaunch after the stock
26-second disconnect debounce. A wrong-request light frame leaves dark intact;
accepted updates switch both ways and persist for the next launch. Connected
restarts establish fresh sessions without restoring a selected token; no action
or app-open request is replayed. The first-use guide remains dismissed.

Root visually reviewed the [dark loading screen](native/startup-dark-loading-without-phone-frame.png)
and [light loading screen](native/startup-light-loading-without-phone-frame.png).
The first two attempts exposed test-harness assumptions: foreground queries need
to wait for the launched app, and reconnect sends a new HELLO request without
requiring a new session in the same native process. Their captures and failure
records remain in `native/before-foreground-wait/` and
`native/before-reconnect-request-wait/`. Only the harness changed before the final
fresh run; production source and PBW bytes stayed identical throughout.

PBW SHA-256:
`cc5b91320a116ef8716b8a71336246455fd0f7811c07cd63f5c1a2ee8199ca17`.
Debug ZIP SHA-256:
`d634ee0700ca4b9249bc2be26cb81dc1100205b4267a2e5757c0826b3593c705`.

```sh
source ../recovery-validation/env.sh
npm test
npm run build
npm run check:artifact
node scripts/check-packaged.cjs
python3 scripts/test-native.py --frames-dir build/packaged-frames
python3 scripts/emulator-smoke.py --startup-theme-only \
  --pbw dist/Dashboard-0.4.1.pbw \
  --expected-sha256 cc5b91320a116ef8716b8a71336246455fd0f7811c07cd63f5c1a2ee8199ca17
```

Use a fresh isolated emulator flash for this focused suite. No physical-watch,
live-phone integration, storage-failure injection or measured battery-life
result is claimed.
