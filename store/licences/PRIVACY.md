# Dashboard privacy

Dashboard uses the Pebble readings, activities and actions you select. Its phone plugin can read location-dependent provider data, music, notifications and watch settings when you allow the corresponding permissions. It can control music, ring Find Phone or open an associated app only through the action you select.

App catalogue searches send your search text to Pebble's public Algolia catalogue at gm3s9tryo4-dsn.algolia.net. Dashboard has no direct weather HTTP client, analytics, advertisements or developer-operated service. Selected providers have their own privacy policies and permissions.

Display preferences, selected providers, pins and action/app bindings are saved through Pebble's settings storage. The watch stores verified display choices and guide state. Live activity and notification content stays in transient memory; Dashboard does not persist private source content. Source expiry, disconnection and removal invalidate capabilities under the existing source lease.

You can change or remove choices in Dashboard settings and revoke permissions in Pebble. Removing Dashboard removes its app-owned watch data; Pebble and third-party providers manage their own stored data. Support reports should omit notification text, precise location, credentials and other private content.
