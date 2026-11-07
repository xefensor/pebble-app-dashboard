# Dashboard

A stock PebbleOS app showing a current activity, the latest notification and two configurable
pins.

## Download

[Version 0.6.3](https://github.com/xefensor/pebble-app-dashboard/releases/tag/v0.6.3) is a development prerelease.

[PBW](https://github.com/xefensor/pebble-app-dashboard/releases/download/v0.6.3/Dashboard-0.6.3.pbw),
[source](https://github.com/xefensor/pebble-app-dashboard/releases/download/v0.6.3/Dashboard-0.6.3-source.zip),
[debug files](https://github.com/xefensor/pebble-app-dashboard/releases/download/v0.6.3/Dashboard-0.6.3-debug.zip), and
[checksums](https://github.com/xefensor/pebble-app-dashboard/releases/download/v0.6.3/SHA256SUMS.txt).

Install the PBW through the Pebble phone app. No separate library installation is needed.

Choose activity sources and pins in the phone settings. Each pin has separate reading, Select
action and Hold Select destination choices. Enable the permissions needed by your chosen
sources. Timer Pause/Resume from Dashboard remains deferred.

[Usage and controls](docs/USAGE.md) · [Current UI](docs/UI.md).

## Compatibility

The current SDK target is **Pebble Time 2 / Emery**, using **Pebble SDK 4.33.1**. Portable and
emulator evidence is versioned; physical phone/watch checks retain their documented gaps.
Existing screenshots keep their original version and provenance.

## Version 0.6.3

- Adopt shared XOCE headers, readable rows, full-height action rails, icons and stock Pebble action-bar feedback.
- Keep immediate selection, complete first-use help, safe Cancel-first confirmations and exact tap/hold action bindings.
- Bundle UI 0.1.1 and the confirmed stay-open phone settings page.

## Development

Use Node 22, Python 3.12 and a C compiler. SDK builds additionally need Pebble SDK 4.33.1 on
PATH.

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run check:artifact
```

[Contributor guide](CONTRIBUTING.md) · [Release preparation](docs/RELEASING.md) · [History index](docs/history/index.md).
Development outputs belong in ignored `build/`; published archives stay frozen.

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE). Preserve bundled third-party notices and attribution.
