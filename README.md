# Dashboard

A separate Pebble watchapp for plugin readings, controls and current activities.

**Status: design previews, 4 November 2026.** The repository contains a starting
brief and an interactive browser prototype. No native watch UI, SDK project or
installable build exists yet. The repository is local and has no remote.

## Preview

Open [the interactive Snapshot preview](previews/snapshot.html), or view the
[expanded groups](previews/expansion-overview.png) and
[detail / return navigation](previews/expansion-navigation.png).
The [earlier layout comparison](previews/index.html) and its exports remain:
[light overview](previews/overview-light.png),
[dark overview](previews/overview-dark.png),
[other activity types](previews/alternate-activities.png) and
[detail screens](previews/detail-overview.png).

Snapshot is the selected opening-screen direction. Activity focus and One list
remain as earlier comparisons.
Each uses a 200 × 228 canvas, the suite's font sources and Pebble's 64-colour
palette. Use the drawn watch buttons or keyboard arrows/Enter/Space/Escape. Examples,
theme, activity order and notification body visibility are selectable. These
are synthetic design previews, not emulator captures or functioning plugins.
See [preview notes](previews/README.md) for scope and regeneration.

## Existing direction

- Use stock PebbleOS and the official phone app; no firmware or mobile-app fork.
- Start with Pebble Time 2 / Emery (200 × 228), like the existing suite.
- Consume ordinary plugin readings, standalone actions and Activities summaries.
  A plugin can provide any combination; a reading or command needs no activity.
- Keep Dashboard's preferences, order and visibility independent of Dynamic.
- Keep opening an associated app separate from invoking its contextual controls.
- Preserve original source identity, revisions, observation, expiry and privacy.
  The native Timer remains responsible for its saved state and alarms.
- Keep text static. User-driven list navigation and local visible-clock ticking
  are compatible with this; automatic text scrolling is not.

## Current discussion

When opening Dashboard through Quick Launch, the user wants to see two current
activities, the latest notification and pinned items. The previews
show the selected Snapshot layout and how its groups expand.
Both activity positions support different types; Music has its own playback
detail proposal.

Snapshot shows two activities, one latest notification and four pinned items.
Pinned is one collection: an item can have a displayed value, a press action,
or both. Weather shows a temperature; Find phone offers an action; Kitchen light
shows brightness and toggles on Select. Reading and command capabilities remain
independent underneath; they can belong to the same displayed item.

These visible slots do not set each collection's total capacity.
Hold Select on an activity or pin to browse Activities or Pinned; the footer
shows the available count. Short Select performs the pin's action when present,
otherwise opens its details. Activities open their contextual detail view.
Back restores the previous item and list position, then
the original Snapshot item. A hold must not also execute the short-press action.
Selecting the notification goes directly to native Notifications; the browser
records that navigation intent without launching a real app. Six activities and
twelve mixed pins demonstrate overflow; these counts are not capacity limits.
The light's 65% value and toggle are simulated; no brightness-adjustment UI or
real plugin command is implemented by this preview.

The user also wants Timer Pause/Resume inside Dashboard, deferred until later.
This is recorded scope, not an implemented Timer command capability.

Latest notification is a separate product idea from Dynamic's temporary new-
notification activity. Its availability and privacy lifetime need implementation;
do not persist private bodies, retain withdrawn/redacted content, replay an alert,
or show the same notice twice when it is already one of the activities.

Configuration, defaults and implementation capacity limits still need design.
The preview's five visible rows in an expanded group demonstrate navigation;
they do not define the catalogue transport or runtime capacity.

## Available foundations

- [Activities 0.4.2](../pebble-activities/README.md) supplies semantic summaries
  and validates optional actions, entity links and app destinations. It does not
  implement a Dashboard action executor; its ACT3 wire view holds two cards.
- [Core 0.5.1](../pebble-watchface-core/README.md) supplies reusable reading and
  transport helpers. Choose what Dashboard needs after agreeing on its flow.
- [Timer](../pebble-app-timer/README.md) currently publishes summaries and an
  app destination. In-Dashboard Pause/Resume requires additional Timer support.
- [Open Activity](../pebble-app-open-activity/README.md) remains the separate
  Dynamic shortcut helper. Dashboard is an app the user can open normally.

The [earlier Dashboard proposal](../pebble-activities/docs/design/dashboard-integration-draft.md)
is background material. Some of its metadata is now implemented, while its
Dashboard screens, command handling and capacity proposals remain unimplemented.
Current public specifications take precedence over stale draft API wording.
