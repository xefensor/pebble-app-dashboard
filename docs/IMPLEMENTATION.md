# Dashboard implementation contract

Local stock-SDK Emery app, UUID `f76f9fc1-2944-4248-bcc5-3eea2af0183b`.
The approved Snapshot and contextual input rules in README.md take precedence
over older suite drafts. Timer commands remain deferred; Back stays ordinary.
No sibling app, firmware or mobile-app changes are required.

The current 0.6.1 readability correction is described at the end of this file
and in [REDESIGN.md](REDESIGN.md); the earlier 0.6.0 trial remains historical.

## Historical 0.6.0 trial

The review branch uses native Gothic 18/24/28 bold for fitted utility text,
retaining compact 11/12/14 Roboto context roles and Fredoka primary numbers.
Unused custom body resources are removed. Snapshot's original four items and
header stay fitted; collections use five 39px rows with a 29px top inset.

Custom action-bar icons use consistent 2px/filled shapes, a 5px immediate press
offset and 144ms EaseOut release. List selection has a short 100ms surface
compression/directional stretch and 250ms settle; labels remain stationary.
Held list repeats skip selection motion. Incoming visual/identity changes,
activation and view changes settle it; focus loss/disconnect/READY/deinit cancel
all feedback. These animations never mutate selection, binding or validity.
No timer runs at rest and no text marquees. The native helper remains a custom
renderer using public Animation and bounded AppTimer APIs, rather than a
private OS MenuLayer port.

The phone template has a 48×4px identity rule, neutral section headings, 16px
card inset/24px section spacing and Light/Dark Watch appearance selector. Only
the select presentation changes: settings v1 stores the same dark Boolean.
User-triggered disclosures use 160ms motion; button feedback uses 144ms and
respects prefers-reduced-motion. The established Save/storage workflows below
remain intact. See REDESIGN.md and qa/0.6.0/VALIDATION.md for measured evidence
and the unavailable browser/device checks.

## Shared UI in local 0.5.0

The DSH1 wire format, settings v1 and native persistence keys are unchanged.
The native header retains a right-aligned local clock in every view, including
the first-use guide. Its existing band can use a small context title and an
18px count/status on the left; no new strip covers the activity or pin rows.
The 18px body font is loaded lazily with the existing fonts. Minute ticks keep
the guide clock current; no animation or high-frequency polling was added.

A confirmation starts with Cancel selected. Up selects Cancel, Down selects
Run action, and Select either cancels or confirms the original request/token/
version. The existing stale-selection guards still withdraw an invalid target.

The phone page keeps the shared 512px neutral shell and Dashboard teal accent.
`settings-i18n.js` provides a self-contained English/Czech copy factory embedded
in both generated page paths. Static interface copy is translated before saved
content loads; controller-owned strings use explicit translations. Plugin names,
provider arguments, store results and user labels are never rewritten by locale.
Unsupported phone languages use English; no 17-language coverage is claimed.

The modern bundled page keeps settings open, uses one inline Saving… / ✓ Saved /
Unsaved changes status, and disables Save when the complete draft is unchanged.
A known local validation failure keeps the editor and says Couldn’t save; a write
with an uncertain outcome retains Save not confirmed / Reload saved recovery.
Only an exact persistence acknowledgment produces ✓ Saved, separately from watch
delivery. A confirmed Save closes only the nested editor and preserves the page
scroll position. Discarding that editor clears its dirty status without a write.
When an intentionally closed editor held focus, it returns to its existing Edit
button without opening a keyboard. Routine opening and selection never focus
inputs. The legacy close-URL path remains explicitly separate.

## Files and ownership

- Root: package/build/resources, `src/pkjs/protocol.js`, integration/validation.
- Phone runtime: `src/pkjs/runtime.js`, `sources.js`, `commands.js`, `queue.js`,
  corresponding tests. Runtime uses settings/protocol, Activities host library.
- Native: all `src/c/*`, portable C tests and native fixture support.
- Settings: `src/pkjs/settings.js`, `settings-page.js`, `settings-i18n.js`, `src/plugin/index.js`,
  generated `config.html`, settings tests and config generator.

## Phone module contracts

Settings 0.4.0 retains the saved v1 pin shape. Since 0.4.2, the associated-app
selector has a PebbleOS apps group for verified native destinations, including
Weather, without store search. Existing pins are not migrated. Native choices
change only `openApp`; readings, actions and custom labels/icons remain separate.
See [native identities and availability](APP-PICKER.md).
The editor offers independent
reading, tap action and hold-app sections, with quick setup and optional local
Done/Cancel. Since 0.4.3 the global Save also gathers and validates an open editor
without requiring Done first. The pure gather step does not replace the draft;
validation and transport failures retain the form, and only a confirmed save
closes it. Other pin edits/reordering are disabled while an item is open to
protect its index and unfinished draft. Saving disables Cancel as well as inputs.
Editor opening, quick setup and store-result selection never call focus();
explicit navigation scrolls to the section without opening the keyboard.

`app-picker.js` exports `common`, `label`, `searchUrl`, `parseResults` and a
self-contained `browserFactory` embedded beside the settings model in both
bundled/legacy pages. The named picker merges verified common destinations,
saved app targets and ephemeral public-store hits. Values are exact lowercase
watchapp UUIDs; labels are presentation only. Explicit Custom app retains the
manual route for unlisted targets. Selecting None removes only openApp. Existing
custom labels and touched names/icons survive metadata/network changes.

The settings page makes a public store XHR only on Search or
Enter in its search field. It requests at most 15 minimal compatible Emery
watchapp records from the single declared host. The credential in searchUrl is
the official app's published client search credential, not an account token.
The page has a seven-second timeout/response-size cap, aborts superseded queries,
and validates editor/search generations before changing its choice list. It
never selects a result automatically, fetches icons, installs/opens an app or
persists the result list. Results use textContent. See [verified current API and
permission boundary](APP-PICKER.md). No future ReadApps source is assumed.

`protocol.js` exports `keys`, `op`, `mode`, `status`, `flag`, `kind`,
`result`, `encode(snapshot)` returning a byte array, and `get(dict,name)`.
Snapshot: `{session,request,sequence,now,mode,status,dark,total,offset,
activitiesTotal,pinsTotal,items}`. An item is a phone display projection:
`{token,version,validUntil,flags,kind,role,clockMode,anchor,baseSeconds,
title,subtitle,value,appLabel,actionLabel,name,controls?,image?}`. All commands/arguments
and provider identities stay on phone, bound to the displayed token/version.

`runtime.js` exports `createRuntime({pebble,storage,now?,later?,cancelLater?})`
returning `{ready,message,configure,stop,configuration,catalogue,reloadSettings,connectionChanged}`.
`configuration()` returns a Promise of `{settings,catalogue,needsRepair}` for the
legacy settings page. When `needsRepair` is true, pass no valid initial settings
to that page so it requires explicit repair instead of presenting saved defaults.
`configure(settings)` validates and saves preferences then rebinds sources.
`reloadSettings()` adopts settings already visible to that runtime's storage
without writing them again; it cannot refresh Android's separate DOM snapshot
from a config-plugin write. The settings page uses the confirmed active-writer
route documented in [APP-PICKER.md](APP-PICKER.md), not a reload notification.
`connectionChanged(connected)` updates live connection state.
`stop()` is terminal for watch/source work. Later explicit settings saves,
reloads and public catalogue reads can remain useful, but cannot restart
subscriptions, timers or native messages on that stopped runtime.
`ready()` announces the runtime; source subscriptions start only after native
HELLO. Both `configuration()` and `catalogue()` discover public metadata without
starting source subscriptions. Installed compatible providers appear even when
they have no active cards.
An increasing same-session HELLO is a reconnect baseline: replace source handles
once, retain token identities and command receipt history, and advance binding
versions so an earlier confirmation cannot authorize a new binding. Duplicate
HELLO requests and unchanged connection notifications do not rebind. Stopped or
cancelled sources stay stopped on later connection events. Disconnect invalidates
in-flight discovery/read callbacks and cancels polling timers; settings reloads
must not restart subscriptions while disconnected.
UUID-form activity exclusions are forwarded as disabledProviders to the shared
host, avoiding their source subscriptions. Instance exclusions still filter only
their local display records. Explicit ordinary reading pins keep their own
independent subscriptions, including readings from a hidden activity provider.

The 30-second heartbeat still checks saved settings and renews required live
transport leases, but sends no unchanged static snapshot. Refresh reads after
confirmed actions are serialized per source: one in flight and at most one
follow-up for later requests. An 8-second local timeout releases that read slot;
its late response is ignored. Subscription updates, errors and expiry invalidate
older read responses. No command is retried or optimistically reflected.
`src/pkjs/index.js` is root-owned thin event wiring.

Activity projection treats the typed `presentation` field as authoritative.
Only an absent presentation uses the legacy music/media-kind fallback. A
standard activity with a media icon still carries its clock and generic action
indices. Ignore malformed unrelated action/source declaration elements before
matching a declaration; public catalogue sanitization does not sanitize the raw
SDK entries used by the active source runtime.

Activity ordering first honors saved exact-instance and provider ranks. Within
one provider at the same rank, active precedes paused and terminal. Countdown
entries reorder by running/nearest deadline only within their lifecycle's
countdown slots. Decorating original positions and sorting independent groups
keeps other providers/text slots stable and avoids a non-transitive comparator.
The item, command and destination bindings move together, never just its label.

`settings.js` exports `defaults()`, `normalize(value)`, `load(storage)`,
`save(storage,value)`; normalization rejects invalid/oversized input by throwing.
Saved key `dashboard.settings.v1`; settings only, never live content.
Shape `{version:1,dark:false,notificationPreview:false,showNotifications:true,
activityOrder:[],disabledActivities:[],pins:[...]}`. Pin:
`{id,label,icon?,builtin?:'find-phone',reading?:{plugin?,category,item,property,instanceId?,index?},
action?:{plugin,action,args?,label,confirm?,toggleProperty?},openApp?:{watchAppUuid,label}}`.
Reading selection uses exact instanceId when configured; index is an explicit
fallback preference only. An action always names its exact plugin. Optional
`toggleProperty` names an authoritative Boolean property used to derive the
desired `on` argument for `set_on`; never infer it from brightness. At most64
configured pins as a bounded initial setting; five rows are a viewport only.
Defaults: Weather temperature, Phone battery, Watch battery (local native pin),
Find phone. Root/runtime resolve built-in providers/actions from enumeration.
The Find phone default uses explicit `builtin:'find-phone'`, resolved to the
actual declared phone action by enumeration; no guessed command is stored.
Never subscribe/read `phone/find_my_phone` as a probe: that source rings the
phone on subscription. Use action metadata and explicit invocation only.
Use `reading:{category:'watch-local',item:'battery',property:'level'}` for local
watch battery; runtime emits an item with kind battery and flag LOCAL_WATCH.
No invented home-light source in production defaults.

`settings-page.js` exports a function `(settings,catalogue)=>htmlString`.
Catalogue supplied by runtime: `{plugins:[SDK enumeratePlugins entries],
instances:[{plugin,category,item,instanceId,name,properties:[names]}],
activities:[{key,name}],error?}`. `catalogue.js` sanitizes only public plugin,
source and action declarations. The page requests live `catalogue` through PKJS;
the official plugin runtime has no `enumeratePlugins` API. With Dashboard closed,
the plugin returns a validated cached declaration list and refresh instructions.
The page handles late readiness and target disappearance without replacing drafts.
`inspect_source` still uses the plugin's supported `readSource` API and excludes
side-effecting Find phone reads. The plugin handler also supports `load_settings` -> settings and
`save_settings` -> settings. Bundled settings bridge
must use the established official plugin-settings SDK mechanism (see helper),
with legacy `showConfiguration`/`webviewclosed` as fallback. Do not silently save.

The independent `dashboard.catalogue.v1` cache is at most 256 KiB of UTF-8 JSON,
with bounded public schemas and no live instances, observations, activity records,
readings, artwork or invocation arguments. Revalidate it on load. Normal successful
runtime enumeration warms it; identical writes are skipped. A missing/corrupt cache
keeps Music available and explains that Dashboard must be opened to discover peers.
The cache is settings metadata only; all watch display and action bindings continue
to use fresh source/runtime data. The official `ConfigPageSession` resolves PKJS
only from the currently matching watchapp session, so settings must not assume a
background PKJS start or silently claim fresh discovery while reading the cache.

## AppMessage keys

4000 DB_OPERATION;4001 DB_SESSION;4002 DB_REQUEST;4003 DB_MODE;4004 DB_OFFSET;
4005 DB_TOKEN;4006 DB_VERSION;4007 DB_ACTION;4008 DB_DATA;4009 DB_RESULT;
4010 DB_TEXT;4011 DB_CONFIRM;4012 DB_INDEX.

Operations: HELLO1, VIEW2, ACTION3, OPEN4, CANCEL5, READY6, FOCUS7.
Modes: OVERVIEW0, ACTIVITIES1, PINNED2, MEDIA3 (DETAIL alias for generic controls).
Statuses: LOADING0, READY1, PARTIAL2, OFFLINE3, PERMISSION4, ERROR5.
Results: PENDING1, SUCCESS2, FAILED3, STALE4, PERMISSION5, CANCELLED6, CONFIRM7.
Native opens with a fresh positive31-bit session and request counter. Phone READY
can request HELLO again if PKJS started after native. VIEW carries mode, offset,
DB_INDEX (desired absolute selected index), optional selected token. ACTION/OPEN
carry exact token/version; ACTION 0 default pin, Music 0 previous/1 play-pause/2
next. Request IDs never authorize duplicate dispatch. CONFIRM1 is explicit user
confirmation after a CONFIRM response; permission prompts remain SDK-owned.
CANCEL invalidates the active native session and its undispatched commands.
FOCUS is coalescible metadata: native local navigation sends current view
request/mode/offset/index/token/version without a new view request or loading
state. Phone retains this exact selected token when live updates reorder a
window. Invalid/stale focus messages never retarget a command.

One ordered phone AppMessage queue; coalesce replaceable DB_DATA snapshots and
FOCUS metadata only. Keep recent32 command receipts plus a monotonic request
watermark: eviction cannot permit replay or impose a lifetime command limit.
No command retries. Recheck current binding, source validity, provider and
session immediately before invocation. Never substitute another item/action.
Native results validate session and request; stale replies never update UI.

## Binary DSH1 frame (little endian)

32-byte header: magic DSH1 at0; session u32@4; request u32@8; sequence u32@12;
UTC seconds u32@16; mode u8@20; status u8@21; count u8@22; theme flags u8@23
(bit0 dark); total u16@24; offset u16@26; activitiesTotal u16@28;pinsTotal u16@30.
The protocol ceiling remains7 overview items /5 list items /1 detail item.
Dashboard 0.2 sends only4 overview items: one activity, one notification and two
pins. The wire ceiling remains compatible; it is not the visible layout. No
private data persisted.

Each item has44-byte header: token u32@0; version u32@4; validUntil u32@8;
flags u16@12; kind u8@14; clockMode u8@15; anchor u32@16; baseSeconds u32@20;
six UTF8 byte lengths u16@24,26,28,30,32,34 for title/subtitle/value/appLabel/
actionLabel/name; image width u8@36;height u8@37;palette length u8@38;role u8@39;
pixel length u16@40;controls blob length u16@42. Then the six strings (no NUL),
optional controls blob, palette
GColor8 bytes, row-packed4bpp pixels (high nibble first, stride ceil(width/2)).
String maxima192/128/48/32/32/64 bytes. Images <=40x40, <=16 palette entries,
<=800 pixels bytes. Combined image payload <=2048 bytes/frame; omit optional
later images to fit. Entire frame <=8192 bytes. No trailing/unknown data accepted.

Flags: ACTION1, APP2, MEDIA4, PRIVATE8, UNAVAILABLE16, PAUSED32, PENDING64,
FAILED128, COUNTDOWN256, ELAPSED512, NOTIFICATION1024, CONFIRM2048, LOCAL_WATCH4096,
MEDIA_PREVIOUS8192, MEDIA_TOGGLE16384, MEDIA_NEXT32768.
Kinds: generic0,timer1,media2,notification3,weather4,phone5,light6,find7,
workout8,navigation9,calendar10,battery11,scene12.
Roles: activity0,notification1,pin2. Clock modes:none0,countdown1,elapsed2.
Countdown: anchor deadline, baseSeconds fixed remaining if anchor0.
Elapsed: baseSeconds accumulated, plus max(0,now-anchor) if anchor>0.
Expiry0 only for independent action-only or local-watch items, or a nonprivate
static configured pin identity with no value/clock (such as unavailable Find
phone metadata before discovery), or the public Notifications launcher described
below. Source display
values must have a real original validity; public outage retention is bounded.
Live SDK sources with null TTL have a separate60s native transport lease,
heartbeated every30s only while the original subscription is active. Keep true
source validity/observation separate; clear on withdrawal/error/disconnect and
never extend a finite source/native Timer validity through this mechanism.

The notification row uses one stable `builtin:notifications` identity whether
displaying a real message or just opening the app. The latter is public static
metadata: role1, kind3, flags APP|NOTIFICATION (optional PENDING/FAILED feedback
bits), expiry0, title/name/appLabel all `Notifications`, subtitle either
`No notifications` for a confirmed empty source or `Open notifications` when no
preview is available. Value, action label, clocks, images and controls are empty.
These exact fields are the only zero-expiry notification exception; live/private
notification content always requires its real lease. Local private expiry clears
content and makes the old binding inert until the phone supplies a new public
launcher version. Notification preview opt-out stops source subscription while
retaining the independent app destination; it does not fabricate a message.

Optional item.controls contains exactly3 strings (each<=32UTF8bytes), encoded
as3 length-u8/string pairs in the blob, total<=99bytes. Blank labels disable the
slot; the3 MEDIA_* flag bits describe available controls0/1/2 for both media and
generic activity detail. Generic activity controls add useful action rows,
never a bare enlarged summary. Pin default action remains a direct tap.

## Native presentation/lifecycle

Snapshot reserves one large activity card, one latest-notification card and two
mixed pin rows, with a right-side contextual action bar. Missing sections show
useful empty states; do not inject fake data. Built-in Weather and battery pins
need only source icon and whole value; specific devices/action-only pins keep
meaningful identity. Music tap dispatches play/pause slot1 directly only when
declared; hold opens the verified associated Music app. Generic activities can
still open useful labelled controls. Optional artwork/icon and source clocks are
local watch rendering.
Paused Media prefixes its existing artist/provider footer with `Paused ·`,
including a Music fallback when artist metadata is empty. This is independent
of which overview row has the sidebar focus; artwork/text geometry is retained.
Only received control labels/availability bits establish a present control; do
not infer disabled actions or invent declarations. The public summary API does
not currently carry a separate per-action disabled state. Native focus retains
the original 0/1/2 action index and skips absent slots, including after updates.

The first-use guide is static and consumes its dismissal click. The watch persists
its boolean dismissal preference (key 1) and, since 0.4.1, the last confirmed dark
theme preference (key 2). Read that preference before creating/pushing the window;
set both the canvas theme and native window background before the first frame.
Only a successfully applied DSH1 snapshot may change the saved theme; rejected,
stale or wrong-request frames must not. Write only when the preference differs
from the last successful save, retrying on a later accepted frame after a storage
failure. Missing/unreadable preferences default to light, including the first
launch after upgrading from 0.4.0 before any confirmed theme has been saved.
Loading, timeout,
disconnect and READY preserve the theme without retaining any private content or
capability. A theme changed on the phone while Dashboard is closed takes effect
with the first accepted snapshot; the watch can only use the last confirmed
preference before then. Fixture builds neither read nor write saved preferences.
Visible source clocks do not tick behind the
guide. A delayed raw-Select preview names the exact associated app without
dispatching it. Once that preview appears, early release consumes the gesture
without a tap action; ordinary quick taps remain unchanged. Stale/expired/replaced items cannot
keep a launch preview. Command progress/success use the sidebar; command failures,
offline status and selected missing-reading reasons use the header. No feedback
overlay may cover a pinned value. Confirmation content identifies the target,
with the action glyph aligned to Select in the sidebar; preserve exact binding
checks and Back cancellation. Idle activity content uses a neutral placeholder.
No automatic text scrolling or repeating idle redraw; tick only visible running
clocks/minute header. One native AppMessage dispatcher and bounded pending view.
Countdown clocks stop second redraws at zero without changing source state.
The zero-unit first SDK tick still paints once while the previous subscription
was SECOND, so a one-second clock cannot remain frozen at 00:01.
`dashboard_deadline.c` retains a single AppTimer for an unchanged absolute source
expiry; replacement, clearing and allocation failure remain explicit. Tick-clock
discontinuities clear/rebase the relative timer. Include unavailable readings in
the expiry plan because their independent action/app capabilities can remain
available until that deadline. The expiry callback still redacts private content
and bindings before scheduling the next deadline.
Retain selection by token, never auto-run new items when a source disappears.
Once a complete frame omits a selected token, later frames remain inert instead
of selecting the replacement row. Ready reconnect/Back replies obey the same
rule even without an intermediate LOADING frame. A failed view clears every
snapshot byte but retains the opaque requested token, allowing only its exact
late restoration. Up/Down and intentional new collection entry can select a
current row. A reconnect HELLO is not deliberate replacement navigation.
Group Back restores overview selection; controls Back restores the originating item.
Native loading/offline/permission failures stay navigable. New view requests
invalidate old responses; timed-out requests cannot leave an indefinite spinner.

## Readability revision 0.6.1

The review branch uses Roboto Condensed Bold 26/24/22/20 utility roles and Fredoka
numeric values. `dashboard_layout.h` isolates compact exact-PFO ink bounds and
adaptive list-window selection from data/capability ownership. Public SDK APIs
still own text widths and rendering. Resources use extended:true; missing
characters map to the packaged wildcard. Regenerate both ink headers from the
compiled resource pack, rebuild, then bind reports to the final artifacts.

The 200px header is 30px tall; its 34px action rail keeps physical anchors below.
Snapshot retains activity/notice/two 32px pins. Its notice can grow to 62px for a
numeric primary; the measured worst accented primary retains 2px ink margins.
Media/text primaries reserve more space and use an explicit Open to read hint
when the preview cannot fit. Collections adapt their visible window inside the
same five-item wire page, retaining token/index, Back and FOCUS7; live shrink
backfills room. Visible list count can drop below four for tall accent groups.

Selection has no Animation lifecycle or geometric transform. Only physical
button icons use a bounded 144ms AppTimer return; repeated releases are idempotent,
allocation failure settles the icons, and focus/disconnect/teardown cancel work.
Phone template changes are CSS-only alignment; Save, storage, schemas, target
binding and privacy logic remain unchanged. See docs/REDESIGN.md and current QA.
