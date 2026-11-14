# Release 1.0.2 · 2026-11-14

The final source tests, fresh builds, package checks and native emulator scope are recorded in [current validation](qa/release-1.0.2/validation.json). Historical galleries keep their capture versions and have explicit final-binary reuse proof. Physical phone/watch and live-provider results are not claimed. Xef authorized stable GitHub publication and retained the existing review acceptance; no new device approval gate applies. Pebble Store submission remains manual and unsubmitted.

# Stable release preparation — 1.0.1

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


## Store update — 1.0.1 (2026-11-14)

Xef requested a new numeric version for the reviewed current implementation and Store handoff. Public Store history already contains 1.0.0; 1.0.1 was absent from the checked public Store history and GitHub tags. The public UUID, saved-state compatibility, pinned dependencies and reviewed native interfaces are retained. New source/artifact/Store verification is recorded with this release preparation; prior emulator captures are reused only after native renderer/resource equality is verified. No new physical-device result is claimed. GitHub branch pushes are authorized; app submission and website deployment remain separate.
