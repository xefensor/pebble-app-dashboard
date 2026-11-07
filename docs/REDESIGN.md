# Dashboard0.6.2 — full-height action rail

Xef clarified that the black rail is acceptable; its interrupted height is the
problem. The34px contrasting rail now covers all228rows, including beside the
header. Light/dark retain the original contrasting palettes and contextual icons.
All content and the header divider remain left of x166. The26pt clock stays
readable atx94..159. The shorter Home heading and collection index/total avoid
crowding a long repeated app/list name beside the clock. Body roles, all four
Snapshot items, adaptive lists and source/input behavior are unchanged.

This is local on `design/pebble-native-redesign`; main and older artifact bytes
remain intact. [Current validation](qa/0.6.2/validation.json),
[representative compositions](qa/0.6.2/composition/emulator.json),
[complete current UX captures](qa/0.6.2/native-ux/emulator.json) and
[activity checks](qa/0.6.2/native-activities/emulator.json) use exact packaged
native bytes in isolated Emery QEMU with synthetic peers. Full-height rail
assertions run on every capture, including header/footer, dark/light, confirmation,
loading/error and held action states. The current source/compiled font ink checks
still apply. [Phone preview](qa/0.6.2/phone-preview.html) uses the unchanged actual
settings with a mock bridge; fresh browser and real phone/watch checks are unverified.
Nothing is pushed or published.

The previous0.6.1 description below is historical; its full-width header has
been replaced by the content-column header above.

# Dashboard readability correction for review

Local **0.6.1** on `design/pebble-native-redesign`, following Xef's review of
0.6.0. This is local and unpublished. Main and older artifacts remain intact.

Xef rejected smaller top time/date, icons sitting above text, text against the
bottom of boxes, and a large clock surrounded by undersized content. Easy
reading and a balanced whole composition take priority over copying Pebble's
small type. These are user requirements. The family and layout below are this
branch's review candidate, not an approved published replacement.

The watch uses Roboto Condensed Bold utilities at 26/24/22/20 points and Fredoka
numeric values. Visible Latin capitals are roughly 19/17/16/14px, with dots,
accents and descenders extending as required. The local clock uses Roboto 26;
view titles and primary text 24, secondary labels 22, hints 20. Snapshot's main
numeric value prefers Fredoka 36 (26px visible digits); both pin values prefer 26
(about 19–20px visible). Fitting never shrinks ordinary labels below their role.

The header spans all 200px. Title and count have separate fitted fields, so a
long title can elide without hiding position. The 34px action rail begins below
the 30px header; Up/Select/Down remain at physical anchors 39/114/190. Clock and
other right-aligned custom text use public SDK advance measurements and explicit
left-positioned drawing; native captures caught clipped leading clock digits
with the earlier right-aligned layout.

Fitted text uses actual glyph ink, including accents, descenders and ellipses,
to center within panels. Icon frames align with the adjacent text group. Actual
native pixel measurements record the remaining half/one-pixel raster rounding.
Supplied artwork retains its pixels and palette. Full-width selection changes
immediately and remains stationary: the horizontal compress/stretch animation
was removed so it cannot cover letters or leave an inset selection. Physical
button icons still press immediately and return once over 144ms; no idle motion.

Snapshot retains one activity, a notification and two 32px pins. The activity and
notice exchange vertical space above fixed pin rows at 160/195. A numeric
primary permits a notice up to 62px, so a fully accented Czech heading and body
remain visible; the worst measured primary group keeps 2px above and below.
Ordinary groups have more space. A compressed primary uses a stable 4px group
gap; normal groups use 6px. Media and text-valued primaries retain more primary
space and cap the notice at 53px. If the optional preview cannot fit, an explicit
**Open to read** hint replaces it without reducing type. Normal horizontal
ellipsis remains; full notification content still belongs to native Notifications.
Snapshot Media uses one 24px title line, 22px artist and 24px artwork. Named pins
keep meaningful identity: Kitchen and 65% both fit in the representative fixture.

Collections retain the five-item wire page, with an adaptive visible window.
The normal mixed-height Activities fixture shows three rows; short/numeric rows
can show four; one-line command rows can show five. Larger accented groups can
show fewer. Rows use 24px titles,
22px Media identity, and values up to 26px, at least 3px group padding and 4px line
gaps. Selected items remain visible; reverse navigation is stable, live shrink
backfills spare space, and page boundaries/Back preserve token and index. A 5px
artwork/text gap lets 22px **The Midnight** fit. No schema/protocol, provider
binding, action availability or privacy behavior changed.

`scripts/generate-body-ink.py` reads the exact compiled SDK 4.33.1 custom PFOs and
writes compact per-glyph bounds for 920 source-font glyphs at each utility size,
plus the Fredoka subset. Extended resources preserve Czech accents and minus.
Widths and rendering still use public SDK APIs; no opaque font pointer/private
OS API is read. Missing characters use the packaged wildcard, not a promise of
all-language coverage or shaping. The earlier stock Gothic probe is retained
only as [research](qa/0.6.1/font-ink/README.md); it does not drive this candidate.

The phone template sets explicit button/select line height and centered button
text. Help summaries gain 10px vertical padding for WebViews lacking block
`align-content`. Field labels, search-result rows, wrapped buttons and checkboxes
retain their intended alignment. Save/focus/draft/storage logic is unchanged.
Browser fitting has not been reverified in this sandbox.

Review [light Snapshot](qa/0.6.1/native-ux/snapshot-light.png),
[dark Snapshot](qa/0.6.1/native-ux/snapshot-dark.png),
[collection](qa/0.6.1/native-ux/activities-title-count-clock.png),
[accented Snapshot](qa/0.6.1/native-ux/layout-czech-second-pin-selected-light.png),
[full-accent stress case](qa/0.6.1/native-ux/layout-full-accent-primary-selected-light.png),
[adaptive fifth selection](qa/0.6.1/native-ux/layout-accented-list-fifth.png),
[confirmation](qa/0.6.1/native-ux/confirmation-target-sidebar.png) and
[the actual-template phone preview](qa/0.6.1/phone-preview.html).
The phone fixture is fictional, isolated from storage/network, with Save blocked.

[Validation](qa/0.6.1/VALIDATION.md) and
[actual ink/padding measurements](qa/0.6.1/layout-pixels.json) separate portable,
packaged and native emulator checks from unverified browser/phone/watch fitting.
Candidate artifacts are `dist/Dashboard-0.6.1.pbw`, matching debug/source ZIPs and
versioned checksums. Timer Pause/Resume remains deferred.
