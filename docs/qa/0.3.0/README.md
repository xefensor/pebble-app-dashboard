# Dashboard 0.3.0 local candidate

This revision improves the existing one-activity/one-notification/two-pin layout:

- Static first-use button guide, plus an exact app destination during Select hold.
- Header/sidebar progress, result and connection feedback that leaves pins visible.
- Selected missing-reading explanations with independent actions kept available.
- Larger generic controls with absent slots omitted and original action indices retained.
- Confirmation target in content, action icon in the right sidebar.
- Neutral, stable Nothing active placeholder.

The notification shortcut remains selectable without a preview. Music still
plays/pauses directly and opens native Music on hold. Timer commands and custom
Back behavior remain deferred. The public activity API has no separate disabled
action state; this revision does not invent unavailable actions or modify that API.

See [validation.json](validation.json), [packaged runtime](packaged-runtime.json)
and [native emulator evidence](native/emulator.json) for exact results and hashes.
The [empty Notifications regression suite](native-notifications/emulator.json)
is a separate isolated run of the same candidate.
The PBW is `dist/Dashboard-0.3.0.pbw`; earlier candidates remain preserved.

Tested PBW SHA-256:
`2d6cdb3c318acb6eb50a926def402a2d2048ed0bfdba21e7cf6c58dd3bad4ca1`.

| Validation | Result |
| --- | --- |
| Node phone / protocol / settings | 60 passed (36 / 9 / 15) |
| Portable C / ASan / UBSan | 16 fixtures and 30 actual runtime frames passed |
| SDK build, artifact, generated config and packaged JavaScript | Passed |
| Full native Emery suite | 31 checks, 48 captures passed |
| Empty Notifications regression suite | 8 checks, 10 captures passed |
| Built source/resources, native payload and screenshot hashes | Matched |

Actual native examples: [button guide](native/first-use-button-guide.png),
[two controls](native/generic-controls-visible-slots.png),
[destination preview](native/held-select-app-preview.png),
[sidebar confirmation](native/confirmation-target-sidebar.png),
[success with both pins visible](native/second-pin-success.png),
[idle with Notifications shortcut](native-notifications/empty-notifications-no-activity.png).

The native footprint is 32,218 bytes against 128 KiB; 98,854 bytes remain for the
heap before runtime allocations. Resources occupy 64,208 bytes against 256 KiB.
These build sizes do not measure peak heap or hardware battery use.

Native screenshots use the installable candidate's unchanged native payload,
with an explicitly fictional phone peer. Packaged JavaScript runs separately
against isolated SDK sources/actions. Real phone permissions, app opening and
physical-watch readability/battery still need device testing.

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
python3 scripts/emulator-smoke.py
python3 scripts/emulator-smoke.py --notifications-only --output docs/qa/0.3.0/native-notifications
```

Run the native smoke harness with the current version's UX mode as documented
by `python3 scripts/emulator-smoke.py --help`. QEMU requires this workspace's
SDK support; LeakSanitizer is disabled only for sandbox ptrace compatibility.
