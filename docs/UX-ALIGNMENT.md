# Dashboard UI/UX alignment handoff

Reviewed baseline: Dashboard 0.4.3; repository HEAD
`61a38a981ba060b556feb7f71de41242a64eed67` on 2026-11-06.

## Canonical design and status

The agreed standard is maintained in the local `xoce` website checkout at
`src/pages/docs/design/pebble-ui-system.md`. When that checkout's preview is
running, read [the unified Pebble UI/UX standard](http://127.0.0.1:4321/docs/design/pebble-ui-system/).
The website has no public repository or deployment yet; this is a local reference.

This handoff records **approved design targets, with implementation pending**.
It does not claim that a released app follows the complete standard. Shared
visual roles use neutral light/dark surfaces and a restrained accent per app.
Exact accent colours and final pixel metrics still need reviewed native and
phone previews. Website colours and web fonts are a separate identity.

## Current implementation

- The native app already has light/dark appearance, Fredoka numeric identity,
  Roboto Condensed interface text, inverted selection and a contextual
  right-side action bar. The confirmed theme is restored before the first
  frame, without retaining private activity content.
- Snapshot contains one activity, one notification and two pins. Select
  executes a supported action; hold Select opens the selected item's optional
  app. Snapshot holds Up/Down open Activities/Pinned; Back restores context.
- The header shows time on Snapshot, but collection position replaces it in
  lists and status/app hints can replace the whole header.
- The primary bundled phone settings page already remains open after a
  confirmed Save. It gathers an open pin editor, preserves failed drafts, and
  checks exact saved choices. The legacy return-URL path still closes.

See [implementation contract](IMPLEMENTATION.md), `src/c/main.c`,
`src/pkjs/settings-page.js`, and [app-picker/storage notes](APP-PICKER.md).

## Pending work

- Align native type roles, baselines, margins, action icons and semantic
  feedback with the common watch pattern. Keep title left/time right visible;
  relocate collection count and relevant status/app hints without obscuring
  either pin row or a critical action. Exact geometry needs native previews.
- Preserve Snapshot density, selection by identity and the inert missing-target
  state. Do not add enlarged copies of read-only items or make Timer
  Pause/Resume available; that control remains deferred.
- Use the shared confirmation composition: explicit action and exact target,
  safe initial choice, and Back returning to the originating selection.
- Align phone spacing, component vocabulary, visibility/order rows, named
  app selection, disclosed advanced fields and translation structure. Keep
  Dashboard's independent activity order, pin bindings and privacy.
- Standardize the Save/status presentation on the supported stay-open path:
  Saving… → ✓ Saved; edits → Unsaved changes; a known failed write → Couldn’t save. Try
  again. Retain the existing confirmed-writer protocol and exact acknowledgements.
  Saved stays visible until edited, and unchanged Save is disabled.
- An uncertain write or timeout shows Save not confirmed with explicit Reload
  saved or retry, not a known-failure or Saved state. Do not retry silently. A phone
  persistence confirmation must not claim watch delivery or source-command
  success. Document any remaining legacy path limitation explicitly instead
  of pretending that styling makes it stay open.

## Acceptance checks for the implementation

- Exercise Snapshot, collections, controls, first-use guide, empty/offline
  states, unavailable readings, app hints and failures in both themes. The
  clock, selected target, pin values and recovery actions remain readable.
- Reorder or remove the selected live item while a button is held. Preserve
  identity and cancellation; a disappearing target cannot redirect a press.
- Save with an open pin editor, remain on the page, edit/save again, close,
  reopen and restart the runtime. Verify the exact pin app/read/action and
  activity order, including a native Weather destination.
- Retain the separate Android DOM/native-store model and runtime/plugin
  topology-handoff checks. A shared in-memory store cannot prove this workflow.
  Exercise load failure, validation, timeout and late responses without losing
  a draft or falsely reporting success.
- Check phone 320/360px widths, enlarged text and keyboard/short-viewport
  layouts. No ordinary field receives automatic focus, and the Save area
  never covers the editor or final help text.
- Follow packaged/native/settings validation for changed code. Distinguish
  browser, emulator and device evidence, and preserve published releases.
