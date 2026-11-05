# Choosing an associated watch app

Dashboard 0.4.0 offers common destinations and name search without asking users
to type a UUID. The saved destination remains the existing explicit
`openApp:{watchAppUuid,label}` setting. Choosing an app does not install it,
launch it, authorize a command, or change a provider's identity.

## Current stock API limit

The official plugin guide identifies mobile **1.17.0.1** as its current version
and marks the `watch/app` source for the **next release**. The shipped SDK has no
configuration-page app picker. `enumeratePlugins()` enumerates phone plugins;
its UUIDs do not establish that corresponding native watchapps exist. Keep the
advanced UUID option for sideloaded/private apps and already saved destinations.
See the [official plugin guide](https://developer.repebble.com/guides/plugins/preview/)
and the pinned [Watch State implementation](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/libpebble3/src/commonMain/kotlin/io/rebble/libpebblecommon/plugin/WatchStatePlugin.kt).

Dashboard 0.4.2 separates **PebbleOS apps** from other named destinations, saved
apps and store results. Native apps are selectable without store search or an
Internet grant. The verified destinations are:

| PebbleOS app | Native watchapp UUID |
| --- | --- |
| Weather | `61b22bc8-1e29-460d-a236-3fe409a439ff` |
| Music | `1f03293d-47af-4f28-b960-f2b02a6dd757` |
| Notifications | `b2cae818-10f8-46df-ad2b-98ad2254a3c1` |
| Alarms | `67a32d95-ef69-46d4-a0b9-854cc62f97f9` |
| Workout | `fef82c82-7176-4e22-88de-35a3fc18d43f` |
| Health | `36d8c6ed-4c83-4fa1-a9e2-8f12dc941f8c` |
| Timeline | `426ccd53-b380-4d83-8d06-9893de3477ce` |
| Settings | `07e0d9cb-8957-4bf7-9d42-35bf47caadfe` |
| Watchfaces | `18e443ce-38fd-47c8-84d5-6d0c775fbe55` |

These come from mobile 1.17.0.1's
[native locker list](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/libpebble3/src/commonMain/kotlin/io/rebble/libpebblecommon/locker/SystemApps.kt#L15)
and [SystemAppIDs](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/libpebble3/src/commonMain/kotlin/io/rebble/libpebblecommon/SystemAppIDs.kt#L7),
checked on 5 November 2026. These two files are unchanged on current main.
They are known identities, not an installed-app scan. Native options omit the
redundant Pebble author suffix inside their named group. This suite's Timer
remains under **Other apps**, using the exact UUID in its manifest. A store Timer
with a different author can have a different identity.

Weather's UUID is also used by the rich native
[PebbleOS 4.44.3 Weather app](https://github.com/coredevices/PebbleOS/blob/2acda4073252801f74c7a29c6480a7a6e53424f6/fw/apps/system/weather/weather.c#L763)
and defined in its
[timeline header](https://github.com/coredevices/PebbleOS/blob/2acda4073252801f74c7a29c6480a7a6e53424f6/include/pbl/services/timeline/timeline.h#L288).
Do not substitute the phone Weather plugin ID or an internal negative OS registry
number. Weather availability requires the phone's
[Weather capability](https://github.com/coredevices/PebbleOS/blob/2acda4073252801f74c7a29c6480a7a6e53424f6/fw/services/weather/weather_service.c#L297).
Mobile metadata excludes Aplite for Weather, Health and Workout; Dashboard targets
Emery. Health visibility also has a firmware
[capability condition](https://github.com/coredevices/PebbleOS/blob/2acda4073252801f74c7a29c6480a7a6e53424f6/fw/apps/system/health/health.c#L173).
The picker explains that availability depends on watch and PebbleOS version;
it does not assert that every listed target is present or launchable now.

Calendar, Send Text and Reminders constants alone do not establish a supported
launch target: they are absent from this mobile native locker list and allowed
shortcut map, so they are not offered. System toggles are not added as app
destinations. Choosing Weather changes only the pin's optional `openApp` binding;
its reading, tap action and existing custom name/icon remain independent. Default
and previously saved pins are not silently assigned new destinations.

## Saving an edited destination

Since 0.4.3, **Save** includes the pin currently open in the editor. A separate
Done step is optional. Validation failure writes nothing, and a pending or failed
save keeps the form. No editor, quick-setup button or result selection calls
focus(); only a user choosing a field opens its keyboard/picker.

The page routes the complete normalized preferences through current SDK targets.
When Dashboard PKJS exists, its `save_settings` config handler calls
`runtime.configure(settings)` and acknowledges the actual saved value. When
closed, the settings plugin saves independently. After a plugin acknowledgment,
the page rechecks for PKJS that may have started during the write and synchronizes
the same value before claiming success. The acknowledgment must contain the exact
normalized candidate. A transport failure while PKJS remains present, or unknown
target availability, stays unconfirmed. Only a fresh query confirming shutdown
permits plugin fallback; at most three writes handle changing runtime topology.

This order matters on Android. In mobile 1.17.0.1,
[WebViewJsRunner.restoreLocalStorage](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/libpebble3/src/androidMain/kotlin/io/rebble/libpebblecommon/js/WebViewJsRunner.kt#L278)
restores a DOM snapshot and mirrors writes to native storage, but DOM reads do
not refresh when the config plugin writes native preferences. SDK
[stop/saveState](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/libpebble3/src/androidMain/kotlin/io/rebble/libpebblecommon/js/WebViewJsRunner.kt#L374)
then saves the entire DOM map, potentially replacing a newly saved Weather
destination with its old value. A plugin save followed by `reload_settings` is
insufficient because that reload also reads the old DOM. The active writer must
update both views. On normal closure,
[handleAppStop](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/libpebble3/src/commonMain/kotlin/io/rebble/libpebblecommon/connection/endpointmanager/CompanionAppLifecycleManager.kt#L67)
awaits stop before removing the PKJS session, enabling the confirmed-absence
fallback. Regression tests model separate DOM/native views and teardown; a
single shared JavaScript Map masks the overwrite. No mobile fork is required.

## Official public store search

The mobile 1.17.0.1 source publishes the Pebble store's client search configuration
in [AppstoreSources.kt](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/pebble/src/commonMain/kotlin/coredevices/pebble/services/AppstoreSources.kt).
[AppstoreService.search](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/pebble/src/commonMain/kotlin/coredevices/pebble/services/AppstoreService.kt)
uses that Algolia index. The current official
[store search page](https://apps.repebble.com/search?type=apps) ships the same
application ID, public client credential and `apps` index. This is not a private
account credential, user token, or access to a user's locker.

`src/pkjs/app-picker.js` generates one public GET request to:

```text
https://gm3s9tryo4-dsn.algolia.net/1/indexes/apps
```

Its URL query parameters are:

| Parameter | Value |
| --- | --- |
| `query` | Trimmed app name, at most 80 Unicode characters |
| `hitsPerPage`, `page` | `15`, `0` |
| `tagFilters` | `[["watchapp","companion-app"]]` |
| `attributesToRetrieve` | `["id","uuid","title","author","type","compatibility"]` |
| `attributesToHighlight`, `attributesToSnippet` | `[]`, `[]` |
| `x-algolia-application-id` | `GM3S9TRYO4` |
| `x-algolia-api-key` | `0b83b4f8e4e8e9793d2f1f93c21894aa` (published client search credential) |

The request uses no account login, bearer token, cookies or private permission.
The model does not fetch app binaries, icons, descriptions or a second details
response. Requests with both header credentials and URL credentials were checked
read-only on **2026-11-05**: HTTP 200, JSON results, and
`Access-Control-Allow-Origin: *`, including `Origin: null`. The URL credential
variant needs no custom request headers or browser preflight. The15-result
field-limited check returned about 12 KiB. These are public HTTP checks, not a
claim of live-phone or physical-watch testing.

Results retain only bounded name/author text and a valid nonzero `uuid`. A store
listing's 24-character `id`/`objectID` is not a watchapp UUID. Invalid entries,
duplicate UUIDs, plugin-only entries, watchfaces, unknown types and entries
without explicit `compatibility.emery.supported:true` are omitted. Up to 15
unique entries survive. All use the existing generic icon, avoiding additional
image/network hosts.

`has_binary:false` for Emery does **not** mean there is no watchapp: it can be a
compatible Basalt app scaled by the OS. The shipped mobile UI distinguishes
compatibility from a native platform binary in
[LockerUtil.kt](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/pebble/src/commonMain/kotlin/coredevices/pebble/ui/LockerUtil.kt).
The picker accepts those supported watchapps. It does not infer compatibility
solely from a plugin's name or discovery tags.

## Network permission and failure behavior

The manifest uses the current scoped permission form, documented by the shipped
[PluginPermissions serializer](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/libpebble3/src/commonMain/kotlin/io/rebble/libpebblecommon/plugin/PluginPermissions.kt):

```json
{"name":"Internet","parameters":{"domains":["gm3s9tryo4-dsn.algolia.net"]}}
```

This requests access only to the configured public search host. It does not request
`GlobalInternet`, future `ReadApps`, another app's private storage, or another
plugin's permissions. The build places `usesPermissions` in the packaged
manifest; a bare native SDK build does not produce this complete manifest.

Configuration-page networking follows the same app permission policy. Loading
the bundled settings UI alone needs no store network request. A denied network
permission, offline connection, timeout or rejected response must leave the
existing selection/draft intact; the page must report the failed search without
claiming that no apps are installed. The SDK owns permission decisions and their
phone UI; Dashboard does not bypass them. A supplied public search credential
does not bypass the app's domain permission. The shipped
[NetworkGate](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/libpebble3/src/commonMain/kotlin/io/rebble/libpebblecommon/permissions/NetworkGate.kt)
maps each request host to the caller's scoped permission.

Adding a network domain can also make the stock default policy ask for reading
permissions that were previously allowed automatically; explicit existing grants
remain valid. If a reading or Music shows Allow access after this update, review
Dashboard's Permissions in Pebble. This follows the shipped
[read-permission policy](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/libpebble3/src/commonMain/kotlin/io/rebble/libpebblecommon/permissions/AppPermissions.kt#L507).

If access was denied or has just been enabled, **allow Dashboard's app-store
Internet access in the Pebble phone app, close and reopen Dashboard settings,
then retry Search**. The current domain policy is captured when the page opens
in [WatchappSettingsScreen.kt](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/pebble/src/commonMain/kotlin/coredevices/pebble/ui/WatchappSettingsScreen.kt).
Android builds its connection CSP from those granted domains in
[WatchappSettingsScreen.android.kt](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/pebble/src/androidMain/kotlin/coredevices/pebble/ui/WatchappSettingsScreen.android.kt);
iOS applies granted-domain content rules in
[WatchappSettingsScreen.ios.kt](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/pebble/src/iosMain/kotlin/coredevices/pebble/ui/WatchappSettingsScreen.ios.kt).
These rules can block a request before the permission gate sees it. Do not
promise that the first search automatically opens a permission prompt, or that a
permission granted elsewhere immediately updates an already open page.

Label results honestly, for example **Apps from store — choose one you've
installed**. Show author as well as name and let the user choose an exact result;
names are not unique. Search is neither a locker query nor an installation check.
Listed public apps are discoverable; unlisted apps need their direct ID/UUID,
while hidden/removed entries are unavailable, as described by the
[official Appstore API](https://appstore-api.repebble.com/). Search can be stale or
temporarily unavailable and does not cover every sideloaded/private app.

After selection the existing Watch State `launch_app` action still requires a
connection, `LaunchApps`, and an app available in the user's locker (including
the mobile app's native system entries) or its supported system shortcut map. Saving a
destination cannot guarantee that a later launch will succeed. Keep the existing
one-connected-watch limitation and current runtime binding/error handling.

## Shared browser model

`browserFactory` is self-contained and can be injected verbatim into the bundled
and legacy pages. `common()` returns fresh metadata, `label(text)` returns a
settings-safe 32-byte UTF8 label, `searchUrl(query)` encodes the bounded GET, and
`parseResults(body)` returns bounded display metadata. The module performs no
network requests, app launches, permission prompts or persistence by itself.
The settings page owns explicit search, timeout, stale-response cancellation,
text-only DOM insertion, draft preservation and explicit Save.
