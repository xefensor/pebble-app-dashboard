# Dashboard Snapshot and expansion preview

This is the historical browser study used for 0.1.0. The native 0.2.0 layout
shows one activity, one notification and two pins with a right-side action bar.
Music now plays/pauses on Select and opens the native app on hold. See the root
README and versioned native captures for the current implementation.

Open `snapshot.html` in a browser for the selected direction. `index.html` keeps
the earlier three-layout comparison. Everything is local; no server, download,
account or phone connection is required. A current Chromium browser is used for
the exported images and checks.

## Compared layouts

1. **Snapshot** shows both activities, the latest notice, Weather and Phone
   values, a light's brightness/toggle and Find phone as four Pinned items.
2. **Activity focus** gives the first activity more room, keeping the same items
   in compact rows/tiles. Swap activities to see media in that larger position.
3. **One list** initially shows both activities, the latest notice, Weather and
   Kitchen light. Move down to reach the other pins. Selection stays
   visible while the list moves.

## Snapshot navigation

Pinned is one collection containing items with a value, an action, or both.
Kitchen light shows 65% brightness and toggles on Select; Find phone has an
action without a value; Weather only shows a temperature on tap. An associated
app destination is independent of the tap action.

| Button | Tap | Hold for 600 ms |
| --- | --- | --- |
| Up | Previous item/control | Overview: Activities; list: scroll up; Music: move within controls |
| Select | Useful activity controls; native Notifications; pin action if any | Associated app when available |
| Down | Next item/control | Overview: Pinned; list: scroll down; Music: move within controls |
| Back | Previous screen, retaining selection | OS reserved; not simulated |

Music opens previous/play/next controls on tap. Summary-only activities and pins
without actions stay unchanged on tap; no screen opens just to enlarge the same
information. Timer has no Dashboard Pause/Resume yet, so its tap does nothing
and its Select hold records the intent to open Timer. Notifications go directly
to their native app on tap, without a Dashboard detail. Every command and app
navigation remains simulated; the browser sends nothing to a phone or watch.

The footer shows the selected tap action (`—` if none), a named associated-app
hint when available, and contextual Up/Down guidance. Collections contain
six fictional activities and twelve mixed pins, with at most five rows visible
and a scrollbar. These are examples, not capacity decisions. In the quiet
example, hold Up opens an empty Activities list; hold Down still opens Pinned.

Group shortcuts work from any overview item. They open the group once; holding
the same button through that transition does not also scroll. Release and hold
again inside the list to scroll, repeating every 140 ms after the initial
600 ms hold. Scrolling stops at the boundary and immediately on release. Back
restores the previous selected row, viewport and playback-control focus. Use
Back to return to Snapshot before opening another collection. Music holds stay
within its bounded controls. Actions in Pinned execute once and stay in the
list. No hold also runs its tap or adds another move on release.

The activity-order button preserves the selected occurrence and Music control
focus across reordering. Real command integration will need pending/result
feedback and confirmed device values; the prototype's toggle is synchronous.

Held Back remains an OS gesture. Stock PebbleOS exits to the app launcher and
does not expose a custom long/raw/repeating Back handler to ordinary apps. This
browser preview only simulates normal Back navigation; it does not claim a
custom hold-to-watchface capability. See the repository README for the audit.

Keyboard: tap or hold arrows and Enter/Space, Escape returns. W / S / H simulate
holding Up / Down / Select. Pointer cancellation, focus loss and resets cancel
pending gestures without executing a short press. No progress is invented from
a countdown that lacks an authoritative duration.

Use the Example selector for Timer/Music, Workout/Directions, long text/countdown
and an empty activity state. Try dark screens, original pixel size, swapping
activities and hiding message text. Quick launch again restores the overview.
Clocks are frozen for comparisons. No text scrolling or idle animation runs.

## Scope

Every screen is a 200 × 228 canvas. RGB channels are quantized to Pebble's
four channel levels, allowing 64 opaque colours. The licensed Roboto Condensed
and Fredoka font sources come from the existing suite; their notices are in
`assets/fonts/`. Native SDK bitmap rasterization, actual watch legibility,
runtime memory, battery, live subscriptions and commands remain unverified.

Latest notification uses fictional text. This does not implement permanent
notification history or decide real body-retention/permission defaults. Real
integration must use available permitted source data, respect withdrawal and
redaction, and avoid duplicating a notification already shown as an activity.

## Regenerate and inspect

```sh
node scripts/capture-preview.cjs --plan
node scripts/capture-preview.cjs
```

Run from the repository root with Chromium installed. The capture script owns
an isolated temporary browser/profile and closes it afterward. It writes PNGs,
contact sheets and `validation.json`, including exact preview/font input hashes.
Checks cover palette and drawing bounds, static idle pixels, button/keyboard
navigation, pointer/arrow/Enter/Space hold-release suppression, contextual
hold-to-scroll and release cancellation, optional app destinations, no-op taps,
empty collections, stable selection under reordering, Music/Back behavior and
simulated controls. Exports include
`expansion-overview.png`, `expansion-dark.png` and `expansion-navigation.png`.
These results describe the browser prototype only.
