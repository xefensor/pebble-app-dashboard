# Stable release preparation — 1.0.0

Xef accepted the reviewed Round 2 implementation on 2026-11-13 and selected a
stable, listed public release. This acceptance removes the earlier additional
physical-device review prerequisite; it does not create unobserved test results.

This release retains Time 2 and Round 2, the public UUID, saved state, permissions
and provider protocols. Duo is excluded. Core/Activities/UI archives remain
pinned to their exact reviewed sources. Older release files and versioned QA
records stay frozen.

The current source/package/emulator coverage is recorded in
[the release review](qa/1.0.0/release-review.json). Physical phone/watch
coverage remains explicitly separate. Earlier versioned reviews retain their
original decisions and do not override Xef's current acceptance.

Prepare/check the Store kit, then freeze the exact candidate with
`python3 scripts/freeze-release.py`. Commit its source, metadata and archives
locally before running this repository's GitHub release preparer. The release
configuration marks this version stable. No upload, tag or publication is
implied by preparation.

Publication uses the existing GitHub release workflow and the exact same frozen
PBW in the Developer Dashboard. Verify listing ownership, the unchanged UUID,
an unused version and live app-owned GitHub support/privacy URLs before upload.
After all six public releases match the checked hashes, activate the redesigned
website and then update Store metadata to its hosted product/support/privacy
pages. The website's live release gate remains mandatory.
