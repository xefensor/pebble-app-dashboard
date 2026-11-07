# Dashboard0.6.2 — full-height action rail

Local unpublished review revision on `design/pebble-native-redesign`.
Xef clarified that black is acceptable; the rail must span the entire height.
[Validation](validation.json) binds native captures to exact PBW `274f95db1ec1e2b931b144a1b63b0a34eb2a089ff8dae09e4b533b2c147a07ef`.

The contrasting34px rail spans y0–227. Header text, dividers and footers stay
inside166px, keeping the26pt clock readable. Concise context preserves the
selected position without shrinking type. Timer uses consistent22pt footers and
complete elapsed values. Existing owner/phone identity and permissions remain.

SDK build, automated source/native tests and actual packaged runtime checks pass.
Current suites include 85 unmodified native captures. Each capture's hash and native payload
match the packaged candidate. 9 previous tracked artifacts retain their bytes.
Actual text ink checks and the detailed suite reports are linked in validation.
Standalone source is packaged after final evidence/docs and checked after commit.

Synthetic fixtures/peers run exact native bytes in isolated Emery QEMU. This is
not real phone/physical watch evidence. Phone settings use the unchanged source;
its preview has a local mock bridge. Fresh browser rendering remains unavailable.
No push, publication or change to main is part of this revision.
