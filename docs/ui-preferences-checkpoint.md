# Dashboard preferences checkpoint — 2026-11-08

Local candidate; no version change, push or publication. Dashboard keeps its
original settings/pin schema and DSH1 source and action identities. The development
page adds independent Text Size and Appearance controls to its existing Save flow.
Watch-confirmed display status remains separate from saving pins and other phone
settings. [UI](UI.md) and [maintenance contracts](MAINTENANCE.md) describe behavior
and ownership.

Follow Pebble Text Size reads the launch-time OS size; manual Small/Medium/Large
use the exact corresponding native font roles. Light and Dark are local overrides.
Follow Pebble Appearance is retained with its last explicit fallback, and the page
explains that the supported SDK has no public system appearance service. Scheduled
system appearance remains pending. Existing explicit appearance migrates without
changing source, action, app or notification settings.

Only an exact native save/readback/application receipt establishes Applied on
watch. Pending choices persist across reopening. A stopped runtime cannot restart
transport retries when later phone settings are saved. Uncommitted defaults remain
Unsaved until phone persistence is verified. Physical phone/Time 2 verification and
published-PBW upgrade checks remain pending in the cross-project acceptance stage.

## Candidate and checks

`build/candidate/Dashboard-0.6.3.pbw` SHA-256:
`793aa3fa682a1dba6c3e8871565264851f9904ebdbcea4bac3bc8ef3e898be42`.
Built with SDK 4.33.1 / CLI 5.0.40. Local portable checks used Node 26.12.0 and
Python 3.13.16; the documented Node 22.23.4 / Python 3.12.15 pair was unavailable.
SDK footprint is 51,035 bytes, with 80,037 bytes before runtime allocation;
resources are 20,812 bytes. These are build figures, not a runtime heap reading.

- `npm test`, `npm run build`, `npm run check:artifact` and `npm run check:config`
  pass. Source checks include 123 JS cases, native codec/store failure paths,
  exact DSH1 identities and presses, legacy pin preservation, bounded delivery,
  stale receipts, reopen/retry, corrupt stores and terminal runtime cleanup.
  All 17 phone locales retain save/reopen behavior.
- `node scripts/check-settings.cjs --pbw build/candidate/Dashboard-0.6.3.pbw`
  passes 36 browser checks with 14 captures. The archived final config HTML runs
  in Chromium against fictional metadata and real source config handlers, with
  separate Android storage views. Source browsing, pin/app edits, closed/live
  writer routing, failures, reopen, Czech and enlarged text remain covered.
  Evidence: `build/qa/settings/validation.json`. This is simulated phone testing.
- `python3 scripts/emulator-preferences-bridge.py` executes the exact optimized
  packaged plugin and PKJS against the unmodified final native payload in Emery.
  A closed-watch save starts pending. Real AppMessage transport ACKs cannot mark
  it applied; exact native persistence/readback receipts do. All three manual
  sizes, Light/Dark and retained Follow Appearance with Dark fallback survive
  native relaunch. Three settled native guide captures accompany each report.
  Firmware 4.33.2: `build/qa/preferences-bridge/1794162073160330434/report.json`.
  Firmware 4.45.0: `build/qa/preferences-bridge/1794162180358332320/report.json`.
  Phone APIs/storage are simulated; the native app and transport run in QEMU.
- `python3 scripts/emulator-smoke.py --native-sizes --output build/qa/preferences-native-sizes`
  passes on Emery 4.33.2: 84 captures and six behavior checks cover the real OS
  sizes, Snapshot panels, light/dark, fifth selection, reverse, paging, exact Back,
  full command labels, safe confirmation and repeated native Window navigation.
  Evidence: `build/qa/preferences-native-sizes/emulator.json`. Its synthetic DSH1
  peer exercises native rendering/input; it does not execute phone handlers.

The native matrix used the preceding package
`71ba1ea788894cac304b21fa437f850ac97d0b24c7d74903906c43c179f891b4`.
The final phone-page correction leaves all native instructions/data and resources
unchanged. The native binary differs only in its SDK-generated four-byte resource
timestamp at offset `0x7C`; the generated manifest also has new metadata.
`build/qa/preferences-payload-equivalence.json` records both complete hashes,
changed byte offsets and the exact matching native content after removing that
known timestamp field. Full native binaries are **not** byte-identical. The
packaged phone/native bridge and Chromium checks above use the final PBW.

## Physical follow-up

No physical phone/Time 2 was available. Disconnect the watch, save a manual size
and Dark, close/reopen settings and check the pending choice remains. Reconnect,
open Dashboard, wait for Applied on watch, then relaunch and check the same size
and appearance. Check existing pin names, exact app destinations, action arguments,
notification privacy and Back selection. Return Text Size to Follow Pebble and
compare after changing the watch size and relaunching. Keep Follow Appearance's
unavailable/fallback behavior separate from system appearance testing.
