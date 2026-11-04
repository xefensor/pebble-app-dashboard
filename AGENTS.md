# Dashboard maintainer notes

This is a new local repository. The current task is repository setup and product
discussion; UI implementation begins when requested by the user. Read README.md
for the starting brief and distinguish proposals from settled requirements.

- Dashboard is a separate stock Pebble watchapp, initially targeting Emery.
  No firmware/mobile-app fork or change to other apps is implied.
- Support ordinary readings, commands and Activities as distinct capabilities.
  Do not require an activity for every reading or control.
- Keep Dashboard settings and priority independent of Dynamic and the helper.
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
The user wants Timer Pause/Resume later. The opening-screen goal is two current
activities, latest notification, pinned items and controls; the layout is still
being discussed. Latest notification is distinct from Dynamic's short alert.

There is no package manifest, SDK build or installable release artifact yet.
Do not describe previews as native captures or physically tested behavior.
