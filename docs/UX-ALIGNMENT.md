# Dashboard UI/UX alignment

Dashboard **0.5.0 is a local implementation candidate**. It has not been pushed
or published. The earlier reviewed baseline was 0.4.3 at
`61a38a981ba060b556feb7f71de41242a64eed67`; published artifacts remain unchanged.

## Shared reference

The canonical design lives in the sibling local XOCE checkout at
`xoce/src/pages/docs/design/pebble-ui-system.md`, with a local preview at
[the Pebble UI/UX standard](http://127.0.0.1:4321/docs/design/pebble-ui-system/).
The website is not publicly deployed. Keep common design rules there and
Dashboard-specific ownership and evidence here.

## Implemented in the local candidate

- The native title/context sits left and local 12/24-hour time stays right,
  including collections, status, app-opening hints and the first-use guide.
  A compact two-line left header fits inside the existing band. Snapshot's
  activity, notification and two pins keep their original geometry.
- Fredoka numbers and Roboto Condensed body roles retain strong inverted
  selection. An 18px status/count font keeps essential context readable.
- Confirmations name action and target, start on **Cancel**, and require Down
  then Select for Run action. Back cancels. Exact token/version/request and
  stale-selection safeguards remain unchanged.
- The phone page uses a 512px neutral light/dark shell with teal
  `#076b65` / `#83d7ca` accents, consistent cards and 44px targets/48px Save.
- Owned interface copy supports English and Czech using the phone locale;
  other locales fall back to English. Source names, saved labels, instances,
  arguments and exact app destinations remain their original data.
- Modern bundled settings stay open after a confirmed Save. The persistent
  inline **✓ Saved** changes to **Unsaved changes** after editing. Save includes
  an open pin editor and is disabled when the whole draft is unchanged.
- Failed validation keeps the editor and draft. Uncertain writes keep explicit
  Save not confirmed / Reload saved recovery; no false rollback or silent retry.
  A confirmed phone write does not claim watch delivery.
- Editor cancellation restores the correct draft status. A completed Save keeps
  page scroll and returns focus only to an existing button if its editor closes.
  Ordinary fields never receive automatic focus. Larger text/short viewports
  move the action area into page flow and keep reorder controls bounded.

## Preserved behaviour and boundaries

Snapshot density, activity ordering/privacy, native notifications shortcut,
commands and instance bindings retain their existing semantics. Timer
Pause/Resume remains deferred. Activity source identity and validity are not
renewed by UI changes. No Activities/Core API, firmware fork, global settings
service, app UUID, DSH1 key or saved settings schema was changed.

The legacy return-URL settings fallback still closes to submit its result.
Only the supported modern bundled page can provide the documented in-page
persistence confirmation. Do not imply that the legacy path gained that bridge.

## Evidence and remaining device checks

See [0.5.0 validation](qa/0.5.0/VALIDATION.md) for actual packaged browser,
portable/native and emulator results. Automated stock-SDK/isolated storage
models are distinct from real-phone WebView permissions and physical-watch
readability, button timing, vibration and battery measurements. Those device
checks remain explicitly unverified.
