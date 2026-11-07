# Dashboard 0.6.0 redesign validation

Local candidate on `design/pebble-native-redesign`. No push, merge or publication.
Older releases and the 0.5.0 PBW/debug/source/checksums stay unchanged.

- `npm test`: **94 JavaScript checks pass**, plus the portable C model against
  16 binary fixtures and deadline timer/correction/retry checks. New actual-page
  controller VM checks cover English/Czech appearance selection, Boolean storage,
  confirmed persistent Saved, save/reopen, custom destination preservation and
  mismatched-acknowledgement recovery. This is a small DOM model, not a browser.
- `npm run build`, `npm run check:artifact` and
  `node scripts/generate-config.cjs --check` pass. The package retains its UUID,
  DSH1/settings v1, permission/config/plugin manifest and license notices.
- `node scripts/check-packaged.cjs`: actual archived phone/plugin scripts pass
  the isolated SDK/provider model. Existing runtime/storage tests cover distinct
  Android DOM/native views and teardown; this is not a live Android phone.
- Native Emery QEMU UX checks cover light/dark Snapshot, the guide and restart,
  collection headers, pending/success/failure, hold cancellation, Cancel-first
  confirmation, sparse controls, neutral idle and feedback motion. Exact counts
  and final package/native payload hashes are in [validation.json](validation.json)
  and the native reports.
- The activity-focused QEMU suite covers Media paused state, typed generic
  actions, and withdrawn selection remaining inert through repeated updates and
  deliberate recovery. No action is retargeted by animation.
- Pixel checks verify the Down icon's actual 5px displacement, rest after short
  navigation and collection-opening holds, anchored list text/artwork, still
  idle selection and rapid navigation followed by Select. Capture timing includes
  screenshot transfer latency; the GIF uses actual states without interpolation.
  Focus-loss cancellation and timer-allocation fallback are checked in the code;
  no covering system window or forced allocation failure was injected.

The [light](native-ux/snapshot-light.png), [dark](native-ux/snapshot-dark.png),
[collection](native-ux/activities-title-count-clock.png),
[confirmation](native-ux/confirmation-target-sidebar.png) and
[motion](native-ux/selection-and-action-feedback.gif) captures use exact candidate
native bytes with a fictional protocol peer. Visual inspection checks both pins,
clock/count, selected Tea countdown and the full fifth Podcast value. These are
native-emulator pixels, not a phone runtime or physical watch.

Fresh Chromium settings QA was attempted against the actual PBW but **blocked**
by an unavailable debugging socket in this sandbox; see
[browser-attempt.txt](browser-attempt.txt). No fresh browser layout, large-text,
full open-editor Save, focus/scroll or reduced-motion fitting result is claimed.
The [phone preview](phone-preview.html) is the actual template with fictional
read-only data and blocked Save/network. The original browser regression script
is retained, updated for the appearance selector, and can run in an environment
with a usable Chromium debugging socket.

SDK memory/resource figures, artifact hashes and command results are recorded in
[validation.json](validation.json). They describe the linked footprint and
available heap, not peak runtime heap, physical button latency or battery life.
Physical-watch readability/feel, live providers/permissions and Android WebView
saving still require device verification. Timer Pause/Resume remains deferred.

Candidate artifacts: `dist/Dashboard-0.6.0.pbw`, matching debug/source ZIPs and
`dist/SHA256SUMS-0.6.0.txt`. The source archive is generated after final docs/QA.
