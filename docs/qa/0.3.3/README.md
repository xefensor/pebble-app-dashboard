# Dashboard 0.3.3 activity display fixes

Local branch `feature/activity-display-0.3.3` starts from clean 0.3.2 commit
`e60e8276a3f5b30ccb0dfe3148217f63b360d555`. Snapshot still shows one activity,
one notification and two pins. Native UUID, DSH1, settings schema, button rules,
private-content lifetime, confirmation and stock Back behavior are preserved.
Timer Pause/Resume from Dashboard remains deferred. No publication is included.

The pass fixes these reproduced failures:

- Two Timer instances arrived as Tea (10 minutes), then Pasta (8 minutes
  20 seconds). Dashboard chose Tea from catalogue insertion order while Dynamic
  chose Pasta. Equal-priority entries from the same provider now group active
  before paused/terminal; countdowns use the nearest deadline. Saved exact
  instance/provider priority still wins. Other providers and text slots do not
  move during countdown tie-breaking. Items retain their own command/destination
  bindings. The packaged cross-app runner reproduces the old mismatch and passes
  the new order, owner pause expiry, resume and Done without losing sibling timers.
- Removing a selected activity made the first complete frame inert, but a second
  frame silently selected a replacement row. A ready reconnect/Back response
  could also choose a different item when its requested token was missing.
  Complete updates now preserve inert selection until deliberate navigation;
  a failed view clears private snapshot content but retains only the opaque
  requested token for an exact late reply. Portable tests cover repeated frames,
  replacement, ready reconnect omission, timeout and exact/wrong late restoration.
  Actual native Select/hold remain inert until Up/Down or collection navigation.
- A valid typed standard summary using `icon:'media'` was treated as Music,
  dropping its countdown and generic Stop control. Typed presentation now chooses
  the renderer; only legacy records without it use the kind fallback. The actual
  public-summary projection is encoded and shown natively with its large clock,
  generic Stop slot0 and same-token app destination.
- Raw unrelated `null`/numeric action or source declarations could throw before a
  valid action or Music source appeared. Narrow element guards retain the valid
  declaration and its existing dispatch semantics. Portable and actual packaged
  tests cover these cases without invoking a live plugin.
- Playing and paused primary Music were pixel-identical while the notification
  row was selected. The [actual 0.3.2 baseline](baseline-native/emulator.json)
  confirms equal primary-region pixels. The existing artist/provider footer now
  prefixes `Paused ·`; native overview and activity-list captures cover present
  and absent artist metadata. Geometry and static text behavior are retained.

The reviewed Activities 0.4.4 pin also brings explicit schema4 paused playback
normalization and source error/recovery handling. Vendored archive SHA-256:
`dffec3e05041515fbf9385a641adf6b40aedda7e8460c0d11ecb4ed019cd5abe`,
source commit `df4f30f4a66419ce835959eeeec6de7999704fa0`.

| Check | Result |
| --- | --- |
| Node phone/protocol/settings | 79 passed (55/9/15), including four new display regressions |
| Portable native model/parser | 16 encoded fixtures; repeated-loss/reconnect/timeout selection and paused identity passed |
| Fake-SDK deadline suite | Existing unchanged-deadline/expiry/correction/cancellation behavior passed |
| ASan/UBSan | Both native suites passed; leak scan disabled for sandbox ptrace compatibility |
| SDK build / artifact | Passed; 32,526 bytes RAM, 98,546 bytes free heap, 64,208 resource bytes |
| Packaged runtime | Actual final PBW phone/plugin scripts passed; 30 encoded frames accepted by C decoder |
| Cross-app packaged runtime | Exact final PBWs passed Timer ordering/state, typed paused media/private expiry, malformed declarations and existing launch/privacy cases |
| Chromium settings | 24 checks / 7 captures; no source reads, subscriptions, actions or native messages |
| Focused real native Emery | 14 captures / 5 checks, explicit fictional protocol peer |

The [native contact sheet](native/activity-contact-sheet.png) is a labelled 2×
nearest-neighbor derivative. Its source PNGs retain unmodified native pixels and
individual hashes. Root independently reviewed the paused footer, standard-icon
clock/controls and repeated missing selection. The full previous UX/reliability
phases remain historical under 0.3.2; they are not claimed as newly captured here.
The SDK retains its existing RWX LOAD-segment linker warning.

Final PBW SHA-256:
`fd3a1c758bc1bd045fdd00f94fe32b6d65e5caef5186a3e164de0549f2b80bc9`.
Native captures remain labelled with their exact tested whole PBW hash
`9306c213111c8e18be276486c6e0d97bc8183e3e531bb920434bb17bde36889e`.
The final packaging correction removed a stale library version from
THIRD-PARTY-NOTICES.md only. [The identity proof](notice-only-identity.json)
confirms identical native, phone, plugin and config bytes, without an SDK rebuild.
Packaged-runtime and global integration checks were rerun against the final PBW.

All sources, apps and commands in QA are fictional test inputs. QEMU validates
native UI/AppMessage behavior; isolated SDK models execute packaged JavaScript.
No live phone, physical watch, real app launch, plugin action or hardware battery
measurement is claimed. The old baseline harness report's version identifies
the 0.3.3 QA target; its exact PBW hash identifies the installed 0.3.2 baseline.

```sh
source ../recovery-validation/env.sh
npm test
npm run build
npm run check:artifact
node scripts/check-packaged.cjs
python3 scripts/test-native.py --frames-dir build/packaged-frames
ASAN_OPTIONS=detect_leaks=0 python3 scripts/test-native.py --sanitize
node scripts/check-settings.cjs
python3 scripts/emulator-smoke.py --activities-only --expected-sha256 fd3a1c758bc1bd045fdd00f94fe32b6d65e5caef5186a3e164de0549f2b80bc9
```

The final command above reproduces the focused flow against the final package;
the recorded native session used the byte-identical payload from the earlier
whole-package hash described above. Fresh SDK builds embed a new resource
timestamp, so verify the new artifact hash rather than expecting a rebuilt PBW
to match the recorded archive byte for byte.
