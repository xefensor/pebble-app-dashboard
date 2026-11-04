# Dashboard 0.2.0 local candidate

This revision makes Snapshot easier to read: one activity, one notification and
two full-width pinned rows, plus a stock-width right-side action bar. Redundant
Weather/battery names are omitted from Snapshot; custom names are retained.
Music Select directly plays/pauses when available; held Select opens Music.
The complete Activities and Pinned collections remain available.

The installable artifact is `dist/Dashboard-0.2.0.pbw`. Its final hashes, source
identity checks and validation results are recorded in
[validation.json](validation.json). The earlier 0.1.0 build and evidence remain
available separately.

Tested PBW SHA-256:
`bdf1880c4527d509b1de10316b9a7f89d4e7f1d3dfa654124d0ea2af41aa7967`.

| Validation | Result |
| --- | --- |
| Phone / protocol / settings Node tests | 55 passed (32 / 8 / 15) |
| Portable native model and sanitizers | 9 fixtures passed |
| Actual packaged runtime frames decoded in C | 26 passed |
| Packaged JavaScript and installable artifact | Passed |
| Chromium settings behavior | 13 checks passed |
| Native Emery QEMU | 22 checks passed, 33 captures |
| Native visual review | 18 screens reviewed |
| Source, resource, artifact and screenshot identities | Matched |

The SDK reports a 29,870-byte native footprint and 101,202 bytes available for
the heap before runtime allocations, against the 128 KiB app budget. Resources
occupy 64,208 bytes against 256 KiB. Long textual names/statuses truncate from
their beginning at readable sizes; whole numeric readings and units fit the
reviewed scenes. These are build/QA results, not peak heap or hardware battery
measurements.

## Evidence and scope

- [Snapshot](native/snapshot-light.png), [Music playing](native/music-playing.png),
  [Music paused](native/music-paused.png), [named pin](native/custom-pin-alias.png)
  and [long text/values](native/snapshot-long-text.png).
- [Native emulator checks and unmodified screenshot hashes](native/emulator.json).
- [Actual packaged phone/plugin JavaScript checks](packaged-runtime.json).
- [Phone settings browser checks](settings/validation.json).

Native QEMU uses a fictional protocol peer with phone JavaScript removed from
the test-only PBW; it retains the candidate's exact native code and resources.
Separate VM checks run the production PBW's actual JavaScript with the real
Activities provider/consumer and isolated SDK sources/actions. Fictional home
lights are QA data, not production providers. Browser previews under `previews/`
are historical design studies and do not show this revision.

No real phone command, physical watch or hardware battery test is implied.
Device testing still needs phone permissions/provider integration, app opening
on one connected watch, readability and responsiveness. Timer Pause/Resume is
deferred; Back retains standard PebbleOS behavior.

## Reproduce

Use SDK 4.33.1, Node.js, Python 3 and a C99 compiler. Browser checks require Node
22+ and `/usr/bin/chromium` (or `CHROMIUM_BINARY`). Emulator checks use this
workspace's `../recovery-validation` support plus Python Pillow/libpebble2.

```sh
source ../recovery-validation/env.sh
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

LeakSanitizer is disabled only because this sandbox does not support its ptrace
mechanism. Rebuilds can change SDK timestamps and PBW hashes; compare each fresh
report against the actual artifact rather than reusing old QA evidence.
