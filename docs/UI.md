# Dashboard: current UI

The accepted UI is merged into main; implementation version 0.6.2 remains
unpublished. Published downloads retain their original versions and interfaces.

Tap Select performs the selected declared action or native Notifications shortcut; hold Select opens only its exact associated app. Hold Up/Down opens Activities/Pinned from Snapshot; the same held entry press must not scroll the destination. Back restores selection. Full-height 34 px contrasting rail and readable26pt time stay. Collections retain exact index/total, adaptive row heights and fifth-item/reverse/page/Back behaviour. Selection remains immediate and stationary; never reintroduce horizontal compression.

## Shared UI development branch

The current development branch uses the pinned `pebble-xoce-ui` package for the
32 px header, 8 px common text inset, measured-ink centering, canonical icons,
aspect-preserving image fitting, full-height action rail and physical-button
feedback. Header title/status and clock use 26-point Roboto Condensed Bold;
ordinary labels use 24 and secondary help uses 22. Narrow header contexts use
concise wording such as "Home" and "Action" rather than reducing the font.
First-use instructions retain all six complete control descriptions.

On Emery, the 34 px rail uses y=54/114/174 centers and one 18 px icon grid. Held
icons move 5 px toward the content; release settles over a bounded 144 ms cubic
curve. Selection surfaces fill the content column with rectangular edges.
Confirmation choices share Timer's y=160/196 positions, 30 px height, 36 px
stride and left-aligned 24-point labels. "Cancel" remains the initial choice.

Dashboard owns its fonts, layers, input callbacks, timers and command bindings.
The library installs no callbacks. In particular, raw Select still captures
the original token/version/mode, shows the 250 ms hold preview and preserves
the separate 600 ms exact-app hold action. Selection remains immediate and
stationary. This branch does not change the version or published downloads.

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
