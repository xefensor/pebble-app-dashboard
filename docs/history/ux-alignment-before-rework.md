# Historical UX-ALIGNMENT.md

Retained before the2026-11-07 rework. Use current UI/maintenance/development
documentation for work on main; older evidence retains its original scope.

The current local0.6.2 review revision restores a continuous contrasting action
rail from y0to227. Header text/divider fit inside166px with the same readable
26pt clock; Home and collection position are concise context labels.
See [current design/evidence](REDESIGN.md). Older geometry below is historical.

# Dashboard UI/UX alignment

Dashboard **0.6.1 is a local readability correction** on
`design/pebble-native-redesign`; [REDESIGN.md](REDESIGN.md) describes this
alternative. The shared **0.5.0 implementation remains the baseline** below. It has not been pushed
or published. The earlier reviewed baseline was 0.4.3 at
`61a38a981ba060b556feb7f71de41242a64eed67`; published artifacts remain unchanged.

## Shared reference

The canonical design lives in the sibling local XOCE checkout at
`xoce/src/pages/docs/design/pebble-ui-system.md`, with a local preview at
[the Pebble UI/UX standard](http://127.0.0.1:4321/docs/design/pebble-ui-system/).
The website is not publicly deployed. Keep common design rules there and
Dashboard-specific ownership and evidence here.

## Shared 0.5.0 baseline

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

## 0.6.0 branch alternative

The review branch keeps the same Snapshot, clock, identities, actions, privacy
and Save semantics. It tests native Gothic utility roles with Fredoka values,
a consistent 2px/filled icon family, immediate press/release feedback and
interruptible list-selection surface motion with stationary labels. Five 39px
collection rows fit the last value above the display edge. Compact context
labels retain their fitted custom sizes.

The phone header adds a 48×4px teal rule after its short localized introduction.
Headings are neutral; cards use 16px inset/24px gaps. Watch appearance is a
Light/Dark selector backed by the existing dark Boolean. Notification/privacy
flags remain meaningful checkboxes. Disclosures have short user-triggered
transitions with a reduced-motion override; persistent Saved never animates or
disappears automatically.

See [0.6.0 validation](qa/0.6.0/VALIDATION.md) for actual package, controller and
native emulator checks. The standalone phone preview is an isolated fictional
layout fixture, not browser fitting or phone verification. The canonical XOCE
standard remains the shared baseline until Xef reviews the branch.

## Readability correction after Xef's review

Xef rejected smaller time/date, high icons, text against box bottoms and a large
clock beside undersized content. The 0.6.1 review candidate now sizes the whole
composition together: shared Roboto Condensed Bold 26/24/22/20 utilities,
Fredoka 36 primary and 26px pin values. All text groups use actual packaged glyph
ink for centering; the header spans 200px while the physical action rail keeps
its anchors below. Selection is immediate, stationary and full-width; bounded
144ms physical-button feedback remains.

Snapshot exchanges primary/notice space, keeps two pins, and shows a fully
accented numeric-primary notice without clipping. Media/text primaries may use
Open to read for an optional preview. Collections adapt the visible window
inside the unchanged five-item wire page, typically 3–4 readable rows, with
fewer for tall accent groups. No setting, protocol or capability shape changes.
See [the design record](REDESIGN.md) and [current evidence](qa/0.6.1/VALIDATION.md).
