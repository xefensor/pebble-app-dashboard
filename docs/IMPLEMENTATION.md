# Dashboard 0.2 implementation contract

Local stock-SDK Emery app, UUID `f76f9fc1-2944-4248-bcc5-3eea2af0183b`.
The approved Snapshot and contextual input rules in README.md take precedence
over older suite drafts. Timer commands remain deferred; Back stays ordinary.
No sibling app, firmware or mobile-app changes are required.

## Files and ownership

- Root: package/build/resources, `src/pkjs/protocol.js`, integration/validation.
- Phone runtime: `src/pkjs/runtime.js`, `sources.js`, `commands.js`, `queue.js`,
  corresponding tests. Runtime uses settings/protocol, Activities host library.
- Native: all `src/c/*`, portable C tests and native fixture support.
- Settings: `src/pkjs/settings.js`, `settings-page.js`, `src/plugin/index.js`,
  generated `config.html`, settings tests and config generator.

## Phone module contracts

`protocol.js` exports `keys`, `op`, `mode`, `status`, `flag`, `kind`,
`result`, `encode(snapshot)` returning a byte array, and `get(dict,name)`.
Snapshot: `{session,request,sequence,now,mode,status,dark,total,offset,
activitiesTotal,pinsTotal,items}`. An item is a phone display projection:
`{token,version,validUntil,flags,kind,role,clockMode,anchor,baseSeconds,
title,subtitle,value,appLabel,actionLabel,name,controls?,image?}`. All commands/arguments
and provider identities stay on phone, bound to the displayed token/version.

`runtime.js` exports `createRuntime({pebble,storage,now?,later?,cancelLater?})`
returning `{ready,message,configure,stop,configuration,reloadSettings,connectionChanged}`.
`configuration()` returns a Promise of `{settings,catalogue,needsRepair}` for the
legacy settings page. When `needsRepair` is true, pass no valid initial settings
to that page so it requires explicit repair instead of presenting saved defaults.
`configure(settings)` validates and saves preferences then rebinds sources.
`reloadSettings()` adopts already-saved settings without writing them again;
`connectionChanged(connected)` updates live connection state.
`src/pkjs/index.js` is root-owned thin event wiring.

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
activities:[{key,name}],error?}`. The settings page requests `catalogue` and
`inspect_source` through its plugin bridge; the plugin calls
`Pebble.enumeratePlugins`/`readSource` and excludes side-effecting Find phone
reads. The plugin handler also supports `load_settings` -> settings and
`save_settings` -> settings. Bundled settings bridge
must use the established official plugin-settings SDK mechanism (see helper),
with legacy `showConfiguration`/`webviewclosed` as fallback. Do not silently save.

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
phone metadata before discovery). Source display
values must have a real original validity; public outage retention is bounded.
Live SDK sources with null TTL have a separate60s native transport lease,
heartbeated every30s only while the original subscription is active. Keep true
source validity/observation separate; clear on withdrawal/error/disconnect and
never extend a finite source/native Timer validity through this mechanism.

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
No automatic text scrolling or repeating idle redraw; tick only visible running
clocks/minute header. One native AppMessage dispatcher and bounded pending view.
Retain selection by token, never auto-run new items when a source disappears.
Group Back restores overview selection; controls Back restores the originating item.
Native loading/offline/permission failures stay navigable. New view requests
invalidate old responses; timed-out requests cannot leave an indefinite spinner.
