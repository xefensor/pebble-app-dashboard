# Dashboard

A separate Pebble watchapp for plugin readings, controls and current activities.

**Status: product discussion, 4 November 2026.** This repository contains the
starting brief only. No watch UI, SDK project or installable build exists yet.
The repository is local and has no remote.

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

## Starting proposal for discussion

One overview could combine pinned favourites with current activities. Pinned
readings and controls would keep their saved positions; temporary activities
could appear below them. Music could have a tailored detail view with available
playback controls, while other items use appropriate reading/activity views.

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
