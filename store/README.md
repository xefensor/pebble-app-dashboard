# Dashboard — XOCE Store artwork

Green panels express an organised overview of different information.

The XOCE family shares Fira typography, graphite and silver device treatment, clear margins and a small wordmark. Each product has its own composition and meaningful geometry. There is no requirement to reuse Halftone’s divider or tile miniature app icons across every banner.

Current watch banners are `emery-family-banner.png` and `gabbro-family-banner.png`, both 720×320, with editable SVG sources. Standalone native screenshots remain raw and unframed. `listing.json` and the package’s `upload-map.json` identify the current upload files. For ČHMÚ, the plugin map intentionally has no screenshots or platform banners.

Store and website glyphs use the XOCE geometric family. The current release integrates its reviewed 25px black launcher glyph; Store icons remain separate from the native launcher resource. Watchapp Store icons are 80×80 and 144×144; the tintable flag is for clients that recolour a transparent glyph. Watchface website marks are not watchapp icon uploads.

The maintained [XOCE artwork tooling](https://github.com/xefensor/xoce/blob/main/artwork/README.md) documents hero selections, generator dependencies, candidate regeneration and Pebble references. The checked-in SVG/PNG files in this repository are the authority for the current release; central tooling produces review candidates and does not replace these files or publish them automatically. `ARTWORK-LICENSES.txt` retains font and illustration credits. The presentation refresh does not change the app version, native display pixels, runtime source or release PBW.

Icon export and integration details are documented with the [central artwork tooling](https://github.com/xefensor/xoce/blob/main/artwork/README.md). Historical generator paths and candidate hashes in provenance retain their original review-package scope. Store uploads use PNG; the website uses the SVG mark at its actual UI size.

## Publication state

`listing.json` describes the current published listing; `publication.json` binds its Store/GitHub URLs, version, UUID and exact PBW SHA-256 to the recorded verification date. `store_submission_allowed: false` means this local kit tool grants no upload authority. A newly generated kit is a published reference snapshot, not a new Store submission, and never replaces a frozen release archive. Future preparation listings remain gated and cannot claim publication without a matching record.

For a published snapshot, the tool first requires the exact recorded PBW SHA-256, then audits its platform identities, native headers and checksums, resource bindings, capture reuse and artwork. It does not require or claim a fresh SDK/ELF build. Preparation candidates retain the strict local ELF comparison.
