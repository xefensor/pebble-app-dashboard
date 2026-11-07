# Dashboard Pebble-native redesign review

Local **0.6.0** on `design/pebble-native-redesign`, based on `67bed1b`.
This is an alternative for Xef to review; it is not published or merged.
The shared 0.5.0 implementation and previous release artifacts remain available.

The native change uses Gothic for fitted utility/list/status roles and retains
Fredoka for primary values. Small context labels keep their compact custom font.
Snapshot still contains one activity, one notification and two pins in the same
geometry. Collections use five 39px rows so the last value remains visible.
Icons now share a consistent 2px/filled weight.

A physical action press moves its sidebar icon immediately by 5px; release
settles over 144ms EaseOut. Single-step list navigation compresses/stretches the
selection surface for 100ms and settles for 250ms. Labels/icons stay anchored.
Repeated holds skip the list animation. Selection, token checks and focus update
immediately; activation/live replacements settle feedback and focus loss cancels
it. There are no idle animation timers or marquees. This follows Pebble's bounded
ActionBar/MenuLayer feedback without importing private OS layers or changing the
Dashboard hold gestures.

Phone settings gain a short teal identity rule, neutral headings and 16/24px
spacing. Watch appearance is a named Light/Dark select, still stored as the
existing Boolean. Other flags retain their checkboxes. A 160ms disclosure
transition and 144ms button feedback respond to user actions and respect reduced
motion. English/Czech copy, source/user text, the exact draft save workflow,
persistent Saved, uncertain writes and separate Android storage ownership remain.

Review actual [light](qa/0.6.0/native-ux/snapshot-light.png) and
[dark](qa/0.6.0/native-ux/snapshot-dark.png) native Snapshot captures,
[collections](qa/0.6.0/native-ux/activities-title-count-clock.png),
[safe confirmation](qa/0.6.0/native-ux/confirmation-target-sidebar.png) and the
[actual-frame motion GIF](qa/0.6.0/native-ux/selection-and-action-feedback.gif).
The [phone preview](qa/0.6.0/phone-preview.html) uses the actual page with a
fictional read-only bridge; it cannot save or use the network. Fresh browser
fitting/reduced-motion checks were blocked by unavailable Chromium debugging
sockets. [Validation](qa/0.6.0/VALIDATION.md) separates completed automated/native
checks from browser and physical-device gaps.

Candidate: `dist/Dashboard-0.6.0.pbw`, matching debug/source ZIPs and
`dist/SHA256SUMS-0.6.0.txt`. UUID, settings v1, DSH1, provider identity/privacy,
safe Cancel-first confirmations, action receipts and native alarm ownership are
unchanged. Dashboard Timer Pause/Resume remains deferred.

The motion GIF repeats a deliberate button sequence for comparison; the app
itself rests without repeating feedback. Frame timestamps record screenshot
transfer latency, so it is evidence of actual states rather than a high-frame-
rate timing measurement. Cover cancellation is checked in the implementation;
a covering system window and physical button feel remain device QA.
