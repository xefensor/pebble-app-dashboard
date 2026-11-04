# Dashboard Snapshot and expansion preview

Open `snapshot.html` in a browser for the selected direction. `index.html` keeps
the earlier three-layout comparison. Everything is local; no server, download,
account or phone connection is required. A current Chromium browser is used for
the exported images and checks.

## Compared layouts

1. **Snapshot** shows both activities, the latest notice, Weather and Phone
   readings, a light control and Find phone on the initial screen.
2. **Activity focus** gives the first activity more room, keeping the same items
   in compact rows/tiles. Swap activities to see media in that larger position.
3. **One list** initially shows both activities, the latest notice, Weather and
   Find phone. Move down to reach the other reading/control. Selection stays
   visible while the list moves.

## Snapshot navigation

Up/Down selects a row or tile. Short Select opens activity or reading details,
uses a control, or records the intent to open native Notifications. Notifications
do not get a separate Dashboard detail screen. Control tiles advertise Toggle
or Ring in the footer. Music's
detail previews previous/play/next; other detail screens have appropriate app
navigation. All controls are simulations and send no phone command.

Hold the middle/Select button for 600 ms on an activity, reading or control to
open its entire group. The footer advertises `Hold: All 6` for these fictional
examples. Up/Down moves through six entries, with at most five visible rows and
a scrollbar. Six is demo data, not a capacity decision. There are no additional
hidden activities in the quiet example. Holding a control never also runs it.

Back from detail restores the exact selected group row and viewport; Back from
the group restores the original Snapshot selection. Short Select on an expanded
control executes it and stays in Controls. Notifications go straight to the
native app, represented only by a status message below the browser preview.

Keyboard: arrows navigate, tap Enter/Space to Select, hold Enter/Space to expand,
Escape returns. H is an alternative hold-preview shortcut. Pointer cancellation,
focus loss and resets cancel pending gestures without executing a short press.

Timer's detail only offers Open Timer: in-Dashboard Pause/Resume is wanted later.
No progress is invented from a countdown that lacks an authoritative duration.

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
navigation, pointer/Enter/Space hold-release suppression, section scrolling,
detail/Back behavior, selection visibility and simulated controls. Exports include
`expansion-overview.png`, `expansion-dark.png` and `expansion-navigation.png`.
These results describe the browser prototype only.
