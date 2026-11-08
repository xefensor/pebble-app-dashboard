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

## UI preferences delivery

Dashboard owns `dashboard-ui-preferences-v1` on the phone and verified native key
3. Guide key 1, legacy dark key 2, `dashboard.settings.v1`, pins and DSH1 identities
retain their formats. The display adapter changes only `dark` in the original
settings record, preserving every source, action, app binding and notification
choice. The existing page Save submits those settings plus separately validated
display choices. Uncertain partial saves retain the draft and require readback;
there is no implicit rollback.

Request/result keys 4013/4014 carry a fixed 20-byte little-endian frame: version,
field count, status and hello flag occupy the first four bytes; revision, text
choice, appearance choice and last explicit appearance occupy four bytes each.
A positive revision and exact persistent readback precede native application and
its receipt. The saved local override takes precedence over later DSH1 snapshot
colours. No source content or capability is stored in this preference blob.

Phone desired choices persist before transport. Only matching revision and every
choice establishes Applied on watch. Native startup/reconnect hello invalidates
a mismatched old receipt. Both directions share their existing single queues; UI
callbacks never consume a queued view/action or its session receipt. READY keeps
only an actual in-flight DSH1 queue slot, independently of an in-flight UI reply.
Preference reflow cancels a held press without changing item identity or bindings.
Stopping the runtime cancels UI retry work; later configuration writes remain
phone-only. The shared UI library owns no settings or transport controller.

A runtime resync, explicit Retry or mismatched fresh watch hello rotates the
positive delivery revision before sending. A delayed receipt from before that
boundary cannot mark the new delivery applied. If the new revision cannot be
verified in phone storage, keep the choice pending and suppress old receipts.
