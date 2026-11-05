# Dashboard 0.3.2 battery work and activity reliability

Local branch `feature/battery-reliability-0.3.2` starts from clean 0.3.1 commit
`6d75d9e`. UI, native UUID, DSH1 fields, settings/cache permissions and command
confirmation contracts are retained. Existing published artifacts are preserved.

The phone now ignores late discovery/read continuations after stop/disconnect,
avoids duplicate reconnect work and explicitly rebaselines an increasing
same-session native HELLO. A fresh binding version invalidates an old confirmation
without discarding command receipt history or replaying a command. Refresh reads
are serialized and bounded: later subscription data/error/expiry wins over an
older in-flight read. Configured hidden Music no longer incurs its built-in
subscription; an explicit pin can still read it.

Both source-expiry schedulers retain an unchanged absolute deadline. Native
relative timers rebase after clock discontinuities or missed ticks. Expiry also
includes unavailable pins whose independent action/app bindings remain live.
Countdowns paint their final zero once and then stop second redraws; they never
manufacture owner completion. Transient LOADING snapshots retain an inert exact
requested identity instead of falling back to an unrelated actionable row.

| Check | Result |
| --- | --- |
| Node phone/protocol/settings | 75 passed (51/9/15) |
| Native model/parser | 16 encoded fixtures passed, including zero/countdown ownership, unavailable capability expiry and bootstrap focus |
| Fake-SDK deadline scheduler |Passed unchanged deadlines, replacement, firing, cancellation, clock correction, bounds and failed-allocation retry |
| ASan/UBSan |Both native suites passed; leak scan disabled for sandbox ptrace compatibility |
| SDK build / packaged runtime / artifact | Passed; 30 actual packaged frames accepted by C decoder |
| Chromium settings | 24 checks and 7 captures; separate plugin/PKJS API surfaces, zero reads/subscriptions/actions/native messages |
| Actual native focused Emery checks | 14 captures / 6 checks on aad06d49…; final phone-only rebuild inherits identical executable/resource bytes with SDK timestamp-only metadata differences |

SDK 4.33.1 reports 32,370 bytes RAM, 98,702 bytes free heap and 64,208 resource
bytes. Its existing RWX LOAD-segment linker warning remains. The reviewed
Activities 0.4.3 archive has SHA-256
`049b5db1a20ccfec123291f8807302a6ee65835c5ca171bc302b546ad4b72123` and source
commit `fbd3ce42771a299e9ce79a23338ac254387f9d1b`.

Measured portable work, not watch battery consumption:

- A static local/action view sends 0 replacement frames over 10 heartbeat checks
  in 5 simulated minutes; the previous forced heartbeat sent 10. Live transport
  leases still advance and finite source expiry still clears content.
- Twenty deliveries retaining one source-expiry deadline cause 0 phone timer
  reschedules; permission withdrawal cancels it and expiry still fires.
- Eight overlapping refresh requests produce 1 in-flight read plus 1 follow-up,
  with newer subscription data/permission loss protected from old responses.
- Fifty-nine unchanged native deadline updates retain 1 SDK timer with 0 cancels
  instead of 59 cancel/register pairs. Real deadline changes still replace it.
- Duplicate connected notifications and stopped/disconnected lifecycle tests
  create 0 replacement subscriptions or periodic timers.

PBW SHA-256:
`ed4ba30c86f0cfbc5f788d74bdca97fa61b9357fbcb9bd21e25ac29147b6aa67`.

The captured native candidate remains labelled
`aad06d496935d05e5a7139a1ba1e8123fe4e3c155fb436d0029356bc97a18266`.
The final hidden-provider policy change is phone-only: executable/relocation and
resource bytes are identical. The SDK's resource timestamp at header offset 124
and corresponding manifest timestamps/whole-file CRC changed during packaging.
[The identity proof](native-payload-identity.json) validates those exact fields;
it does not relabel old captures as a new runtime execution.

The emulator uses an explicitly fictional protocol peer and exact packaged native
bytes. Packaged JavaScript runs against an isolated SDK model. No real phone,
physical watch, live provider command, actual app launch or hardware battery
percentage is claimed.

Independent review added regressions for post-stop settings calls and the SDK's
zero-unit first tick. Final native captures introduce a one-second countdown
from a static view: 00:01 becomes 00:00 and matches an explicit zero-clock reference.
That isolated synthetic-peer test sets QEMU's RTC to establish a controlled
one-second window; no native Timer alarm or physical watch is involved.
The final contact sheet is [here](native/reliability-contact-sheet.png).

```sh
source ../recovery-validation/env.sh
npm test
npm run build
npm run check:artifact
node scripts/check-packaged.cjs
python3 scripts/test-native.py --frames-dir build/packaged-frames
ASAN_OPTIONS=detect_leaks=0 python3 scripts/test-native.py --sanitize
node scripts/check-settings.cjs
python3 scripts/emulator-smoke.py --reliability-only --expected-sha256 ed4ba30c86f0cfbc5f788d74bdca97fa61b9357fbcb9bd21e25ac29147b6aa67
```
