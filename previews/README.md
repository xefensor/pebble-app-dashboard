# Dashboard overview studies

Open `index.html` in a browser. Everything is local; no server, download,
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

Up/Down selects a row or tile. Select opens an activity, notification or reading
detail. Explicit control tiles advertise Toggle or Ring in the footer. Music's
detail previews previous/play/next; other detail screens have appropriate app
navigation. Back returns. All controls are simulations and send no phone command.
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
navigation, detail/Back behavior, selection visibility and simulated controls.
These results describe the browser prototype only.
