# Historical system-font research

This isolated SDK 4.33.1 Emery probe measured native Gothic18/24/28 Bold ink
through public draw/Screenshot APIs. It helped establish that nominal font
sizes are not comparable visible sizes. Xef subsequently rejected the mixed
small-body/large-clock composition, so **production 0.6.1 uses bundled Roboto
Condensed Bold and Fredoka**, not the reference header in this directory.

The probe report/captures and source hashes describe that study's bytes only.
Current production provenance is ../body-ink.json and ../clock-ink.json,
generated directly from exact packaged PFOs by scripts/generate-body-ink.py.
The app's current visual/behavior result is in ../VALIDATION.md.
