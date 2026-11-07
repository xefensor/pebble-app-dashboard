# Dashboard maintenance contracts

These are current implementation constraints. They apply when changing the
relevant subsystem, not as a requirement to reread every document for every edit.

## Ownership and compatibility

Preserve DSH1 identities, session/token/version checks and exact command bindings. Never persist private activity/notification content. Keep one activity, notification and two pins in Snapshot. Readings and independent commands are distinct capabilities. Zero is not owner completion. Default pins do not gain implicit actions or app bindings. Cancel is the initial confirmation choice. Source removal/expiry invalidates capability immediately according to the existing lease.

## Current interaction and product boundaries

Tap Select performs the selected declared action or native Notifications shortcut; hold Select opens only its exact associated app. Hold Up/Down opens Activities/Pinned from Snapshot; the same held entry press must not scroll the destination. Back restores selection. Full-height 34 px contrasting rail and readable26pt time stay. Collections retain exact index/total, adaptive row heights and fifth-item/reverse/page/Back behaviour. Selection remains immediate and stationary; never reintroduce horizontal compression.

## Source ownership

src/c/dashboard.c owns the portable DSH1 state; dashboard_deadline and dashboard_layout own expiry/layout policy; main.c integrates the SDK and renders. src/pkjs owns discovery, capabilities, commands and settings.

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
