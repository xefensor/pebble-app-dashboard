# Dashboard

A separate Pebble watchapp for plugin readings, controls and current activities.

**Status: design previews, 4 November 2026.** The repository contains a starting
brief and an interactive browser prototype. No native watch UI, SDK project or
installable build exists yet. The repository is local and has no remote.

## Preview

Open [the interactive comparison](previews/index.html), or view the exported
[light overview](previews/overview-light.png),
[dark overview](previews/overview-dark.png),
[other activity types](previews/alternate-activities.png) and
[detail screens](previews/detail-overview.png).

The three opening-screen proposals are Snapshot, Activity focus and One list.
Each uses a 200 × 228 canvas, the suite's font sources and Pebble's 64-colour
palette. Use the drawn watch buttons or keyboard arrows/Enter/Escape. Examples,
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
activities, the latest notification, pinned readings and controls. The previews
compare how much can remain visible at once and what needs button navigation.
Both activity positions support different types; Music has its own playback
detail proposal. No proposal is selected yet.

The user also wants Timer Pause/Resume inside Dashboard, deferred until later.
This is recorded scope, not an implemented Timer command capability.

Latest notification is a separate product idea from Dynamic's temporary new-
notification activity. Its availability and privacy lifetime need implementation;
do not persist private bodies, retain withdrawn/redacted content, replay an alert,
or show the same notice twice when it is already one of the activities.

Overview composition, list versus grid, navigation, control placement, defaults
and capacity limits are open decisions. No row count, pixel layout or transport
budget from an earlier draft is accepted as a requirement here.

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
