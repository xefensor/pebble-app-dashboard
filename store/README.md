# Dashboard — XOCE Store artwork

Green panels express an organised overview of different information.

The XOCE family shares Fira typography, graphite and silver device treatment, clear margins and a small wordmark. Each product has its own composition and meaningful geometry. There is no requirement to reuse Halftone’s divider or tile miniature app icons across every banner.

Current watch banners are `emery-family-banner.png` and `gabbro-family-banner.png`, both 720×320, with editable SVG sources. Standalone native screenshots remain raw and unframed. `listing.json` and the package’s `upload-map.json` identify the current upload files. For ČHMÚ, the plugin map intentionally has no screenshots or platform banners.

Store and website glyphs now use the refreshed XOCE geometric family. Separate 25px launcher candidates are included under artwork/icons; the runtime launcher mappings and PBWs remain unchanged. Watchapp Store icons are 80×80 and 144×144; the tintable flag is for clients that recolour a transparent glyph. Watchface website marks are not watchapp icon uploads.

The review package’s `artwork/README.md` documents explicit hero selections, generator dependencies, regeneration and Pebble references. `ARTWORK-LICENSES.txt` retains font and illustration credits. The presentation refresh does not change the app version, native display pixels, runtime source or release PBW.

Icon export and integration details are documented in the review package’s `artwork/ICONS.md`. Store uploads use PNG; the website uses the SVG mark at its actual UI size.
