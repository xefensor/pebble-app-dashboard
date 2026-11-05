# Dashboard

A stock Pebble watchapp for current activities, the latest available notification
and pinned readings/actions. **0.4.0 is a published Emery development prerelease.**

The native app, phone runtime and bundled settings page are implemented in
[xefensor/pebble-app-dashboard](https://github.com/xefensor/pebble-app-dashboard).
Build and portable/emulator checks are recorded under
[docs/qa/0.4.0](docs/qa/0.4.0). Real-phone permissions/provider integration and
physical-watch comfort/battery still need device testing. Synthetic SDK/emulator
fixtures are not evidence of live phone operation.

## Try the build

Download [Dashboard 0.4.0](https://github.com/xefensor/pebble-app-dashboard/releases/download/v0.4.0/Dashboard-0.4.0.pbw),
[source](https://github.com/xefensor/pebble-app-dashboard/releases/download/v0.4.0/Dashboard-0.4.0-source.zip),
[debugging files](https://github.com/xefensor/pebble-app-dashboard/releases/download/v0.4.0/Dashboard-0.4.0-debug.zip)
and [checksums](https://github.com/xefensor/pebble-app-dashboard/releases/download/v0.4.0/SHA256SUMS.txt).
The release is pinned to tested source
[`dc3bbd5`](https://github.com/xefensor/pebble-app-dashboard/tree/dc3bbd53c79d70daf188cbcd8a0d1074c00d8819).
Later documentation commits preserve those package/source/debug bytes. The local
copy remains `dist/Dashboard-0.4.0.pbw`; build instructions are below.
The previous [Dashboard 0.3.1](https://github.com/xefensor/pebble-app-dashboard/releases/download/v0.3.1/Dashboard-0.3.1.pbw) remains available,
with source, debug files and checksums in its
[development release](https://github.com/xefensor/pebble-app-dashboard/releases/tag/v0.3.1).
Install the PBW using the official Pebble phone app with plugins
enabled. Allow permissions needed by your selected readings and controls. Open
Dashboard normally or assign it to Quick Launch in Pebble settings.

App UUID: `f76f9fc1-2944-4248-bcc5-3eea2af0183b`. Initially targets Pebble Time 2 /
Emery, 200 × 228. Existing Dynamic, Timer and Open Activity installations keep
their own identities, preferences and behavior.

## On the watch

Snapshot shows one current activity, one latest notification and the first
two Pinned items. The activity can come from any supported source. Fewer visible
items make room for larger text, clocks and icons. A right-side action bar shows
the selected item's available button actions. Weather and battery pins use an
icon and value; specific devices and action-only pins keep meaningful names.
Pinned is one collection: an item can expose a reading, a tap action, or both,
plus an optional associated app destination. A light's brightness and toggle can
belong to the same pin; toggle state comes from a real Boolean source.

| Button | Tap | Hold |
| --- | --- | --- |
| Up | Previous item/control | Snapshot: Activities; list: scroll up; controls: previous control |
| Select | Music play/pause, useful controls for other activities, native Notifications, or pin action; otherwise no-op | Associated app when available |
| Down | Next item/control | Snapshot: Pinned; list: scroll down; controls: next control |
| Back | Previous screen, retaining selection; exit at Snapshot | Standard OS behavior |

A readable button guide appears once on first use. Select dismisses it without
performing the underlying item's action. During a deliberate Select hold, the
header previews the actual associated app and the sidebar shows the launch icon.
Releasing after that preview but before the hold completes cancels the gesture
without also performing the item's tap action.
Only the guide-dismissed preference is saved on the watch.

Holds start after 600 ms; list navigation repeats every 140 ms while held.
Opening a collection never also scrolls it; releasing adds no tap or extra step.
Back restores the original item, viewport and control focus. Live reordering
preserves selection by identity, including moves made locally within a page.
If that activity disappears, Select and hold stay inert through subsequent
updates. Use Up or Down to choose a current item; reconnect never silently
substitutes another app or action for the requested activity.
Phone-runtime restart establishes a new native session; old replies and action
tokens cannot acquire a different target.

Music toggles playback directly on Select when the source declares play/pause.
Paused Music says Paused in its artist row, even when another item is selected.
Hold Select opens the native Music app for the rest of its controls. Other
activities can expose up to three provider-declared controls. Only present
controls take space; navigation preserves their original action indices and
skips absent slots. A named disabled control remains distinct from an absent one
when the received data actually describes it.
Summary-only activities and pins without actions do nothing on tap. Source
clocks tick on the watch; text stays static and starts from its beginning.
Native redraw follows visible changes rather than automatic text scrolling.

Commands show static pending dots and a brief success check in the sidebar.
Failures and connection status use the header, leaving both pins visible. A
selected missing reading shows a short reason such as No data or Allow access;
its independent action/app capability remains separate. Confirmation identifies
the target and uses the action icon in the sidebar rather than repeating an
action sentence. The idle activity area uses a neutral Nothing active state.

Commands require exact current bindings and are
never automatically replayed after timeout. Configured/provider confirmation is
honored. A command acknowledgment does not fabricate a new reading: refreshed
device/source data supplies the value.

## Settings and sources

Pins have separate **Show a reading**, **Tap Select** and **Hold Select** choices.
Quick setup buttons take you to the right part of the editor; these capabilities
can still be combined in one pin. App selection fills a new pin's name and icon,
and preserves any name or icon you have edited. Finish with **Add pin** or **Done**,
then use the page's **Save** to apply your changes. Other pins stay locked while
you finish or cancel the current item.

For **Hold Select**, choose an app by name. Music, Notifications and this suite's
Timer are available as common choices. **Find another app by name** searches the
official public Pebble store and shows name/author choices; selecting one fills
its actual watchapp destination. Choose an app already installed on your watch.
The current phone SDK cannot supply an installed-watchapp list, and store search
does not verify installation. Sideloaded/private apps can use **Custom app**;
manual UUID entry is kept there rather than required for normal setup. Saved
destinations and custom names survive empty results, errors and offline use.

Store search is explicit and needs Dashboard's scoped app-store Internet access
in Pebble. After changing that permission, save any edits and reopen Dashboard
settings before searching again. Common/saved choices need no store request.
The phone's permission policy may also ask you to approve reading access after
this update; existing explicit grants remain valid. See [app-picker API and
permission notes](docs/APP-PICKER.md) for the current stock SDK limits.

The bundled phone page works independently of Dashboard's native lifetime.
Open Dashboard on the watch once to discover installed providers. Live discovery
runs in its phone-side app code; Pebble does not provide that API to the settings
plugin or start Dashboard merely because its settings page opens. After discovery,
the page can use a bounded saved list of public provider declarations while the
watchapp is closed. It refreshes when Dashboard becomes available and explains
missing discovery beside the Activity priority list. Inactive compatible providers
are listed too. Only public declarations are cached, never activity instances,
readings, message content or action arguments.
Choose sources/properties and stable instances, add optional actions with typed
arguments, and reorder pins. Dashboard's activity priority/visibility is separate
from Dynamic. Saves are explicit; failed loads never silently replace saved
preferences. Confirmed settings changes notify the running phone runtime.
Within one provider at the same saved priority, active entries precede paused
and finished entries; countdowns use the soonest deadline first. An explicit
instance priority still wins. Countdown tie-breaking preserves text positions
within each state group and never moves another provider. An activity's icon does not choose its
layout: a standard countdown can use a music icon and keep ordinary controls.

Defaults are Weather temperature, Phone battery, local Watch battery and Find
phone. No fictional home-light provider is installed. Find phone runs only on an
explicit tap; discovery never reads its side-effecting source. Missing providers
retain saved bindings and show unavailable instead of selecting another entity.

The first profile allows up to 64 configured pins and a bounded phone-side
activity catalogue. Native receives up to four overview items, five list items or
one control view at a time. The six activities/twelve pins in design examples are not
list limits. Dashboard owns DSH1 paging/commands; Dynamic's two-card ACT3 transport
is unchanged. See [implementation contract](docs/IMPLEMENTATION.md).

Current Music/Notifications built-ins are Android capabilities. Third-party
Activities summaries and ordinary plugin readings/actions use the existing
plugin API. Stock app destinations require verified built-in source identity;
other sources need an explicit real app association.

## Notifications and privacy

Dashboard shows the newest currently available permitted notification returned
by the built-in source, including its initial snapshot. This is separate from
Dynamic's temporary new-notification alert. It creates no history and replays no
alert. Opening Notifications opens the app, not a particular message.

The notification row stays selectable when there is no preview. Select opens
native Notifications from this empty row too. Turning off "Show latest
notification" stops reading message data while keeping the app shortcut.
Unavailable previews never stand in for the phone's full notification history.

Message bodies are off by default. Withdrawal, redaction and permission loss
clear content. Music, notifications, artwork and live source values stay in RAM;
only configuration is stored. Source observations/expiry and native Timer
ownership remain authoritative. Null-TTL live sources have a separate 60-second
watch transport lease, renewed only while their subscription remains active.
That lease never renews finite native-owner source validity.

Reconnect refreshes source subscriptions and invalidates previous confirmations;
duplicate connection events do not repeat that work. Late refresh reads cannot
replace newer live readings or restore withdrawn permission. Static local/action
views skip unchanged heartbeat frames. Hidden activity providers are not read;
explicit pinned readings from those providers remain independent. Source leases
and settings checks retain
their normal schedule. Countdown display stops ticking at zero while waiting for
the owner to report completion. Original validity and privacy deadlines still
clear content and capabilities at their precise native deadline.

The public connection service debounces disconnect reporting (25 seconds in the
stock firmware used for emulator QA). Native private content clears when the SDK
notification arrives or its lease expires; physical radio loss is not detected
immediately. Old session frames, expired bindings and stale commands are rejected.

## Current scope

- Timer exposes its summary and app destination. Dashboard Pause/Resume remains
  deferred; native Timer owns saved state and alarms.
- App opening uses the official phone Watch State action. It needs a connection
  and permission and currently targets connected watches: use one connected
  watch. It opens the whole app. A dispatched platform action cannot be recalled.
- Back keeps stock behavior. PebbleOS reserves held Back to exit to the launcher;
  custom Back shortcuts remain deferred. No global success-exit override is set.
- This is a development testing build, not an appstore publication or a claim that every
  arbitrary plugin schema/action has been tested on a real phone.

## Build and validate

Use Pebble SDK 4.33.1, Node.js, Python 3 and a C99 compiler:

Browser QA additionally needs Node 22+ (global WebSocket) and Chromium at
`/usr/bin/chromium`, or a path supplied through `CHROMIUM_BINARY`.

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run check:artifact
node scripts/check-packaged.cjs
node scripts/check-settings.cjs
```

In this shared workspace, first source `../recovery-validation/env.sh` to keep
mutable SDK state inside the workspace. Use `npm run build` to package the
permissions, plugin/config and notices; a bare SDK build is incomplete.

`scripts/emulator-smoke.py` uses isolated stock-derived Emery QEMU and an explicit
fictional phone peer. It installs no physical device and sends no real phone
commands. Packaged-JS checks separately execute actual PBW scripts against an
isolated SDK model and the pinned Activities provider/consumer. Portable C tests
cross-decode JS fixtures and cover malformed/stale/expiry/navigation cases.
Sanitizers: `python3 scripts/test-native.py --sanitize`; disable LeakSanitizer only
where the sandbox cannot support its ptrace mechanism.

Production excludes native fixtures. `DASHBOARD_FIXTURE=1` produces a separately
named synthetic UI fixture build, not the real app.

## Design previews

[Earlier interactive Snapshot](previews/snapshot.html),
[browser expansion study](previews/expansion-overview.png) and
[earlier comparison](previews/index.html) remain discussion artifacts. Actual
native captures are in the versioned QA folder. Those browser studies predate
the larger 0.3.0 Snapshot and its direct Music play/pause behavior.

Licensed under the suite's PolyForm Noncommercial terms; see LICENSE and
THIRD-PARTY-NOTICES.md. Activities 0.4.4 is vendored with checksum provenance.
