# Dashboard 0.3.1 settings discovery fix

0.3.0 requested plugin discovery from the settings plugin, whose runtime does
not expose `Pebble.enumeratePlugins`. Dynamic correctly performs discovery in
PKJS. The old browser mock exposed enumeration in both contexts, hiding this bug.
The discovery error was also buried in collapsed Help, leaving the activity
section looking empty.

Live discovery now uses PKJS metadata enumeration. Installed compatible providers
appear even without active cards. Opening Dashboard normally also refreshes a
bounded cache of public declarations; settings can read that cache through the
plugin while Dashboard is closed. First install explains that Dashboard must be
opened once. Current-target checks and a bounded fallback handle app closure,
late readiness and older SDKs without replacing unsaved preferences.

No live instances, activity/notification content, readings, observations or action
arguments enter the metadata cache. It is never used to authorize watch actions.
Settings-only discovery starts no source subscriptions or native messages.

## Evidence

- [Browser checks and exact SDK-context counters](settings/validation.json).
- [Live provider list](settings/activities-live-discovery.png),
  [first-install guidance](settings/activities-watch-closed-first-install.png),
  [closed-app cache](settings/activities-watch-closed-cache.png),
  [visible discovery error](settings/activities-discovery-error.png).
- [Actual packaged runtime checks](packaged-runtime.json) and
  [build/source identity](validation.json).

The browser runs the actual Dashboard config handlers with separate supported
plugin and PKJS API surfaces and fictional public provider declarations. It
checks both reply orders, target loss, rejected requests, cache bounds and
preservation of saved order/visibility. These are not live-phone tests.

Native C and font resources are unchanged from 0.3.0; its native screenshots
remain historical evidence in the previous version folder, not new 0.3.1 captures.
The new packaged runtime still feeds real frames through the native C decoder.

Tested PBW SHA-256:
`d513be9def575990ca1f0120d3a0f5bb41c5dd617a843db4129ed63495a6fa2d`.

| Check | Result |
| --- | --- |
| Node phone / protocol / settings | 66 passed (42 / 9 / 15) |
| Chromium actual-handler settings cases | 24 passed, 7 captures |
| Config-only discovery side effects | Zero reads, subscriptions, actions or native messages |
| SDK build, packaged runtime, artifact and generated config | Passed |
| Portable native model | 16 fixtures and 30 actual packaged frames passed |
| Native C/font/resource identity against 0.3.0 | Unchanged |
| Source and artifact identity | Matched |

## Primary SDK references

- [Plugin source API bridge](https://github.com/coredevices/mobileapp/blob/38ab8a09372baaac380bce2f0c73d6b20fb6c393/libpebble3/src/commonMain/kotlin/io/rebble/libpebblecommon/plugin/PluginSourcesJsBridge.kt).
- [Plugin runtime installation](https://github.com/coredevices/mobileapp/blob/38ab8a09372baaac380bce2f0c73d6b20fb6c393/libpebble3/src/commonMain/kotlin/io/rebble/libpebblecommon/plugin/JsPlugin.kt).
- [Settings target lifecycle](https://github.com/coredevices/mobileapp/blob/38ab8a09372baaac380bce2f0c73d6b20fb6c393/pebble/src/commonMain/kotlin/coredevices/pebble/config/ConfigPageSession.kt).
- [Official plugin and settings guide](https://developer.repebble.com/guides/plugins/preview/).

## Reproduce

```sh
source ../recovery-validation/env.sh
npm test
npm run build
npm run check:artifact
node scripts/generate-config.cjs --check
node scripts/check-packaged.cjs
python3 scripts/test-native.py --frames-dir build/packaged-frames
node scripts/check-settings.cjs
```
