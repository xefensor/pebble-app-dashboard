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

There is no package manifest, SDK build, test suite or release artifact yet.
Do not describe design notes as working or physically tested behavior.
