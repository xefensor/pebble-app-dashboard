# Dashboard: current UI

The current release is 0.6.3. Earlier downloads and frozen evidence retain
their original versions and interfaces.

The published 0.6.3 download keeps its original interface. The local development
candidate uses native PebbleOS type roles and navigation, with the same SDK
version label and public identities. See [native navigation verification](native-navigation-checkpoint.md).

Tap Select performs the selected declared action or Notifications shortcut;
hold Select opens only the exact associated app. Hold Up/Down opens
Activities/Pinned from Snapshot. The held entry press never scrolls its
destination. Back restores the selected item by identity. Source capabilities,
not the moving highlight, decide whether an input may run.

## Native controls and shared type

Snapshot, Activities, Pinned, action detail, confirmation and the button guide
each have an app-owned Window. Ordinary navigation uses animated SDK push/pop.
The outgoing surface retains a transient copy of its presented state until the
transition finishes; all Window/layer objects remain alive until app exit.
Caches are never persisted and expired/private data is redacted before drawing.

Activities and Pinned use MenuLayer with rows measured from their actual native
fonts and content. The five-item transport page remains independent of the
visible row count. Values and units wrap completely; optional titles/artists
are bounded. SDK cell highlight state supplies animation colors. Native logical
selection is immediate while the OS owns the highlight and scrolling motion.

Snapshot keeps its activity, notification and two pins in a measured custom
composition inside ScrollLayer. Larger text scrolls the selected panel into
view. The button guide wraps all six complete descriptions and scrolls when
needed. Non-media command detail and Cancel-first confirmation use measured
MenuLayers, including scrollable context and complete command labels. Media
retains its artwork and three icon controls.

The pinned shared UI candidate supplies the exact PebbleOS Header,
MenuCellTitle, MenuCellSubtitle and Footer font profiles for Emery's three OS
sizes. The app resolves the launch-time size once and uses it for both measure
and paint. No custom font resources are bundled. Dominant timer numbers use
unscaled native LECO fonts; source units use the selected text role.

The header reserves the measured full local clock before fitting its left label.
The 34 px contrasting rail remains full height, with y=54/114/174 icon centers,
18 px canonical icons, 5 px held displacement and bounded 144 ms release at a
33 ms cadence. The app's single click provider owns tap, hold, raw and repeat
handling; the shared library installs no callbacks.

## Input ownership

Raw Select captures session, view request, mode, item token/version and command
focus. A changed identity, version, focus or view cancels that press permanently;
returning to the earlier value before release cannot revive it. Each press can
be consumed only once. Paging/loading blocks actions, and confirmation checks
its original bound request again before dispatch. A simultaneous direction
press cannot retarget a held Select.

Navigation settles old input before changing the stack. A late disappearing
Window callback cannot cancel input already owned by the destination. The
250 ms app preview and separate 600 ms exact-app hold remain unchanged.
Ordinary confirmation tests wait for the actual new Window before testing
Cancel; receipt of the phone response alone is not watch-window readiness.
Rapid-input checks remain separate and require no wrong-target dispatch.

The development settings page adds Text Size (Follow Pebble / Small / Medium /
Large) and Appearance (Follow Pebble / Light / Dark) to the existing Save flow.
Pins, source bindings and the DSH1 protocol retain their current schema. The
display status distinguishes saved phone choices from watch-confirmed application.
Uncommitted defaults remain Unsaved until the phone verifies persistence.
The SDK has no public appearance service: the page explains the unavailable
Follow Appearance mode, retains the choice and uses its last Light/Dark fallback.
Manual text choices use the exact native roles above. They take precedence over
the launch-time OS size and survive relaunch. See the
[preferences checkpoint](ui-preferences-checkpoint.md).

Preserve DSH1 identities, session/token/version checks and exact command bindings. Never persist private activity/notification content. Keep one activity, notification and two pins in Snapshot. Readings and independent commands are distinct capabilities. Zero is not owner completion. Default pins do not gain implicit actions or app bindings. Cancel is the initial confirmation choice. Source removal/expiry invalidates capability immediately according to the existing lease.

## Native/phone verification

Inspect actual affected compositions, full text, glyph/icon alignment, edges,
light/dark and relevant critical states. Keep the actual packaged native payload
and report hashes bound together. Preserve the accepted complete UI rather than
reintroducing a historical trial. Phone palette is independent of watch appearance.
Read [maintenance contracts](MAINTENANCE.md) before changing persistence, routing
or source lifecycle. Current build/QA commands are in [CONTRIBUTING](../CONTRIBUTING.md).

## Frozen evidence

[Version 0.6.2 evidence](qa/0.6.2/validation.json) belongs to its original
frozen build at `b7fe6c2d5b60c3559832377347f2c4a08e31ea91`. Routine development uses build/candidate and build/qa;
that output does not overwrite these records. Physical phone/watch checks and
fresh browser checks remain explicitly separate.


## Supporting text contrast

Supporting/help text uses the normal foreground colour rather than blended grey.
This keeps black text on white and white text on black readable without changing
type sizes or layouts. See the [contrast checkpoint](text-contrast-checkpoint.md)
for the current candidate and verification scope.
