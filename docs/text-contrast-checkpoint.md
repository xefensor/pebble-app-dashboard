# Readable supporting text — 8 November 2026

Dashboard's supporting text now uses the normal foreground colour. This removes
the grey wash from explanatory/help text and secondary labels: black on white,
white on black.

The change affects text ink, including inverted selection text where applicable.
Font sizes, layout, saved appearance choices, artwork, decorative separators,
source validity and action availability remain unchanged.

Current candidate: `build/candidate/Dashboard-0.6.3.pbw`. SHA-256:
`b779042347647f37ac200f4f8190c9925f901452bcec2f89e515c18fd2d2b91e`.

`npm test`, `npm run build`, `npm run check:artifact` and
`npm run check:config` passed. 49 captures and 12 native checks cover supporting/guide text, light/dark, unavailable controls, action safety and Back selection.
Evidence: `build/qa/text-contrast/emulator.json`. Native runs used verified Emery 4.45.0 assets;
phone APIs/providers are simulated and no new physical-device test is claimed.

Existing checkpoint hashes describe their original candidates; this is a new
local candidate. No version bump or release archive was created.
