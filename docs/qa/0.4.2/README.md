# Dashboard 0.4.2 native app picker

Local candidate on `fix/native-app-picker-0.4.2`, based on startup-theme fix
`c18c986c203365e0c679f81a6fc41e1e176e3e9f`. No GitHub publication is implied.

The app destination selector has a **PebbleOS apps** group with Weather, Music,
Notifications, Alarms, Workout, Health, Timeline, Settings and Watchfaces. These
use verified native identities from the shipped mobile locker list, independently
of the app store and phone plugin UUIDs. See the pinned primary sources and
availability conditions in [APP-PICKER.md](../../APP-PICKER.md).

Selecting a built-in destination needs no search request or Internet permission.
Opening it still uses the existing phone connection and LaunchApps permission.
Availability depends on the watch/firmware and phone capabilities; the choices
are not an installed-app inventory. Saved v1 settings and DSH1 are unchanged.
Only an explicitly edited pin receives a new destination; default/saved pins
are not silently migrated. A pin's reading, tap action and existing custom
name/icon remain independent of Hold Select.

Verification passed:

- 88 JavaScript tests, including the nine existing picker model cases.
- Two portable native suites using 16 encoded fixtures.
- Production SDK build and packaged-artifact checks.
- Actual PBW phone/plugin scripts in an isolated fictional SDK; their 30 frames
  also passed the C decoder.
- [32 Chromium check groups and 10 captures](settings/validation.json) using the
  final PBW's exact archived settings HTML. The bridge and store XHR are mocked;
  no real phone, network or app launch is involved.

The focused browser checks select Weather from its named PebbleOS group with
the exact native UUID and weather icon, saving an app-only pin with zero store
requests. An existing Weather reading also retains its reading, declared tap
action, confirmation, arguments and custom label/icon when choosing Weather;
None removes only the app destination. The original pin is restored before the
remaining existing checks. Source/plugin identity and stale-search protections
remain covered.

Native C and resources are unchanged from 0.4.1. Resource bytes and plugin.js are
identical. The native executable differs only at SDK resource timestamp offsets
124–127; all code/data/relocations match. No new emulator run is claimed. The
existing startup-theme verification in [0.4.1](../0.4.1) remains applicable to
this native implementation. RAM footprint is 32,666 bytes; resources 64,208 bytes.
All 24 older PBW/ZIP artifacts in [the inventory](previous-artifacts.json) keep
their original hashes. Artifact/debug/source identity is in
[artifact-check.json](artifact-check.json).

PBW SHA-256:
`e54b9df39aa4f7b0b7abecd8fff00b1abaf3cbcaab550066c9565de2819acdf4`.
Archived settings HTML SHA-256:
`485d14d116be64c600b25273cf00a2eec230ce5bef828cfe219a1c79ea5fae13`.

```sh
source ../recovery-validation/env.sh
npm test
npm run build
npm run check:artifact
node scripts/check-packaged.cjs
python3 scripts/test-native.py --frames-dir build/packaged-frames
node scripts/check-settings.cjs --pbw dist/Dashboard-0.4.2.pbw
```

No physical-watch or live-phone launch test is claimed.
