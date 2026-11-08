# Dashboard maintenance contracts

These are current implementation constraints. They apply when changing the
relevant subsystem, not as a requirement to reread every document for every edit.

## Ownership and compatibility

Preserve DSH1 identities, session/token/version checks and exact command bindings. Never persist private activity/notification content. Keep one activity, notification and two pins in Snapshot. Readings and independent commands are distinct capabilities. Zero is not owner completion. Default pins do not gain implicit actions or app bindings. Cancel is the initial confirmation choice. Source removal/expiry invalidates capability immediately according to the existing lease.

## Current interaction and product boundaries

Tap Select performs the selected declared action or Notifications shortcut; hold Select opens only its exact associated app. Hold Up/Down enters Activities/Pinned without repeating into the destination. Real Windows own navigation; native MenuLayers own collection, command and safe confirmation motion. Snapshot and the complete guide use measured ScrollLayer content. Use actual native PebbleOS font roles at the effective size, preserving the left label/right complete clock and full-height 34 px rail. Keep exact index/total, bounded paging, fifth-item/reverse/Back behavior and identity restoration. App code owns click composition and every resource lifetime. Latch cancellation when a held Select's session, view, identity, version or command focus changes; never dispatch twice or retarget the release.

## Source ownership

src/c/dashboard.c owns the portable DSH1 state; dashboard_deadline owns expiry and dashboard_press owns portable press validation; main.c owns measured native rendering, windows and input. Legacy dashboard_layout/font metrics remain for historical tooling and tests. src/pkjs owns discovery, capabilities, commands and settings.

## Phone persistence and evidence

For apps with phone settings, keep active-writer selection, separate Android
DOM/native storage views, exact application acknowledgements and bounded handoffs.
Saving stays open where supported; uncertain writes retain the draft and explicit
readback/retry. Discard cannot undo a write already sent. Load errors must not
silently replace saved choices with editable defaults. Do not introduce unsolicited
focus or scroll changes. Historical browser/emulator results do not validate a
new build. Keep portable, packaged, simulated transport and real-device claims distinct.

## Dependencies, identities and licences

Preserve public identifiers, message-key numbers, compatible storage formats,
licences and attribution. Pinned vendor archives/checksums remain independent of
sibling checkouts. Do not repin consumers or change published bytes as cleanup.

## History

[Earlier maintainer notes](history/maintainer-notes-before-rework.md) retain the
full rationale/history. Read them only when investigating an old decision.
