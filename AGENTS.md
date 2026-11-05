# Dashboard maintainer notes

This repository contains the native Dashboard development prerelease (0.4.0),
its phone runtime/settings, and earlier browser design studies. Read README.md
and docs/IMPLEMENTATION.md. Preserve UUID f76f9fc1-2944-4248-bcc5-3eea2af0183b,
DSH1 message keys and existing published sibling apps.

- Dashboard is a separate stock Pebble watchapp, initially targeting Emery.
  No firmware/mobile-app fork or change to other apps is implied.
- Support ordinary readings, commands and Activities as distinct capabilities.
  Combine readings and commands in one Pinned collection: a pin can expose a
  value, a press action, or both. Do not require an activity for a reading/action.
- Keep Dashboard settings and priority independent of Dynamic and the helper.
- Plugin discovery belongs to PKJS. The settings plugin has no enumeratePlugins
  API, and opening config does not start a noncurrent Dashboard PKJS session.
  Use live PKJS metadata when available and the bounded public declaration cache
  when closed. Never cache live instances/cards/readings/arguments or use metadata
  cache entries to authorize execution. Tests must keep the two SDK API surfaces
  distinct, including readiness and disappearing-target cases.
- Activities metadata support does not imply an implemented command executor,
  Dashboard catalogue transport or native Timer controls. Check actual APIs.
- Keep source identity, original validity, privacy and native alarm ownership.
  Never manufacture completion or renew saved observations through polling.
- Keep private activity content out of persistence and logs. Persist only the
  configuration needed for chosen readings, controls and preferences.
- Measure this app's native image, heap, transport and redraw work independently.
  Do not adopt another host's screen/card limits as Dashboard requirements.
- Preserve existing repositories and published artifacts. Do not create a remote
  or publish this repository as part of a request for local setup.

`previews/` contains a browser-only design prototype with fictional data. Its
capture script verifies canvas bounds, palette and simulated navigation; it is
not a native test suite. Keep preview controls disconnected from real phone APIs.
The user wants Timer Pause/Resume later. The native opening-screen goal is one
current activity, latest notification and two pinned items, with large readable
type and a right-side contextual action bar. Default Weather/battery pins need
only icon and value; retain specific device/action identity where meaningful.
Older browser previews contain more items and are historical discussion material.
Snapshot is the chosen overview. Tap Select directly toggles Music playback when
the exact source declares it, opens useful controls for other activities, opens
native Notifications, or performs a pin's optional action. Pins without actions
and summary-only activities do nothing on tap; do not add bare enlarged views.
Timer has no Dashboard controls yet. Hold Select opens the selected item's
optional associated app; without a destination it does nothing. Hold Up opens
all Activities and hold Down opens all Pinned items only from the overview.
The notification row remains selectable as a public native-app shortcut when
its preview is empty, unavailable or disabled. Do not retain private content to
keep that shortcut alive; the phone supplies a current public launcher binding.
Inside full lists these buttons repeat navigation while held; inside generic
controls they keep focus within the bounded controls. Music hold opens the native
Music app rather than adding a Dashboard playback screen. Back restores the
previous selection.
An overview hold opens its collection once; continuing that same hold must not
start scrolling. A release must never add another navigation step or action.
App hints name the destination, and activity reordering preserves selection and
control focus. First use shows a static readable button guide, dismissed without
triggering an item action; persist only its dismissal flag. Holding Select can
preview the exact app destination in the header. Header/sidebar feedback must
leave the two pin rows visible. Explain selected unavailable readings without
disabling independent commands. Generic control navigation skips absent slots
while preserving provider action indices. Confirmations identify the target and
use the action icon in the right sidebar. Keep an empty activity area neutral.
Real command integration must report pending/result state
and only update values from confirmed source state.
All navigation destinations are simulated intents in this browser prototype.
Six activities and twelve mixed pins are fictional overflow examples, not a
capacity decision. Latest notification is distinct from Dynamic's short alert.

Stock PebbleOS reserves held Back for system exit to the launcher. Third-party
apps cannot install a long/raw/repeating Back handler or shorten that timeout.
Preserve this behavior; do not simulate a custom watchface-exit hold or globally
set a successful-action exit reason, which can override app handoff targets.

Use npm test, npm run build, npm run check:artifact, packaged runtime checks and
focused native/settings QA appropriate to the change. Run SDK commands in the
workspace recovery environment when needed. Build packaging is required for the
plugin/config/permission manifest; plain pebble build alone is incomplete.
Native list focus must be sent through FOCUS7 even for local viewport moves.
READY means a fresh phone runtime: rotate the native session, invalidate old
bindings/sequence/history and re-handshake without mixing in-flight outboxes.
Keep source capabilities and command receipts transient. SDK source/action
errors must remain visible/navigable. The public disconnect event is debounced;
do not claim immediate physical radio-loss detection. App launches currently
affect connected watches, so the supported launch setup has one connected watch.
Do not describe browser previews as native captures or synthetic emulator/SDK
fixtures as physical-watch/live-phone evidence. No publication is implied.

Version 0.3.2 keeps the UI and DSH1 protocol. Reconnect HELLO rebinds sources
once per new request and advances binding versions without resetting command
receipts. Duplicate connection notifications and stopped runtimes must not
subscribe again. A delayed refresh read cannot overwrite a newer subscription
update, error or expiry; coalesce reads per source with a bounded follow-up.
Static snapshots need no heartbeat frame, while live transport leases still
renew normally. Keep the native expiry timer when its absolute deadline is
unchanged; rebase relative timers after clock discontinuities. Unavailable
readings can retain independent capabilities, whose deadlines still apply.
At 00:00 stop countdown redraws without inferring owner completion.
The SDK's first tick can have zero changed units: paint the final zero before
dropping a previous SECOND subscription. Terminal runtime.stop must remain
terminal for source/watch work even if settings are saved or reloaded afterward.
Pass UUID-form disabled activities to the host's disabledProviders setting so
hidden providers are not subscribed. Instance-only exclusions stay local, and
explicit reading pins from that provider remain independent.

Version 0.3.3 preserves saved provider/instance priority. Within one provider
and equal preference rank, active precedes paused/terminal; countdowns sort by
nearest deadline within their own lifecycle slots. Other provider/text positions
stay stable. Typed presentation chooses Media, not its icon; a standard activity
can use a media icon while retaining its generic clock/actions. Paused Media
must be visible in its existing artist footer independently of sidebar focus.
Missing selection stays inert through repeated complete snapshots and requested
target timeout/reconnect. Only an exact restored token or deliberate navigation
can restore actionable focus. Never carry private snapshot content through a
failed view. Malformed unrelated source/action declaration entries must not
prevent a valid activity/control or Music source from being displayed.

Version 0.4.0 simplifies pin configuration without changing settings v1 or native
DSH1. Hold Select uses named app choices and an explicit public-store search;
the stock mobile SDK does not currently enumerate installed watchapps. Never
use arbitrary plugin UUIDs as watchapp destinations or label store hits installed.
`app-picker.js` owns verified common IDs, bounded compatible store hits and
32-byte UTF8 default labels; its browserFactory is serialized into both settings
paths. Only explicit Search performs an XHR, scoped to the one declared Internet
domain. Cancel/close/selection/new search invalidate stale replies; no search
response may choose a destination or replace editor fields. Keep saved unknown
UUIDs/custom labels, offline choices and explicit None removal independent of
reading/action bindings. Advanced Custom app preserves private/sideloaded targets.
New untouched names/icons may be suggested; existing or manually edited ones
must stay intact. Lock other pin edits/reordering until local Done/Cancel.
The app-level network grant is checked when the config page opens; users may
need to allow it in Pebble and reopen settings. Do not promise an inline prompt.
Internet can affect the stock default read-permission policy; document this
without silently changing grants or starting sources from settings. Native UI,
control dispatch, activity policy and Timer control support stay independent.

Published v0.4.0 is frozen at tested source
dc3bbd53c79d70daf188cbcd8a0d1074c00d8819. Its source ZIP carries that Git commit
comment; later documentation on main must not rewrite published artifacts or
retag the version. Validate release-source/archive identity against that commit,
not a later documentation-only HEAD. Runtime source/debug hashes remain exact.
