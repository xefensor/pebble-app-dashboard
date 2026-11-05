# Dashboard 0.4.0 pin settings verification

Local branch `feature/simple-pin-settings-0.4.0` starts from clean Dashboard
0.3.3 commit `be58d4599ebd2c74ea374c1c16fa5ebff5f2199d`. The saved v1 settings
shape, exact reading/action bindings, native UI and app identity are retained.
The editor separates Show, Tap Select and Hold Select. Common/saved app choices
and explicit store search replace required manual UUID entry; Custom app keeps
that capability available. Local Add pin/Done and global Save remain distinct.

| Check | Result |
| --- | --- |
| Phone/protocol/settings/app-picker JavaScript | 88 passed, including 9 app-picker model cases |
| Portable native | 2 suites / 16 encoded fixtures passed |
| SDK build / artifact | Passed; 32,526 bytes RAM and 64,208 resource bytes |
| Actual packaged runtime | Final PBW phone/plugin scripts passed in an isolated SDK model |
| Chromium on actual archived config.html | 31 check groups / 10 captures passed |
| New native emulator run | Not performed; native implementation/layout is unchanged |

[The browser validation](settings/validation.json) binds the tested HTML to the
exact final PBW, not just the generated repository page. Its configuration hash
is `86022c0867ccc67d709558f3d8310097f2899bbb4c033a0e8f872aba961658ba`.
[The browser record](settings/browser-record.json) includes each screenshot hash,
layout review and editor draft guards. See the [store results](settings/pin-app-store-results.png)
and [selected app](settings/pin-app-store-choice.png) captures.

Root independently reviewed both app-picker captures; the name/author choices,
collapsed advanced fields and local Done action are readable at phone size.

[Native identity](native-identity.json) verifies unchanged C/resource inputs and
identical resource bytes. The only native binary differences are the app version,
SDK CRC/resource timestamp and the parsed GNU build-ID descriptor; all other
code/data/relocation bytes match 0.3.3. Existing native captures keep their original
scope. The final packaged runtime's 30 frames also pass the actual C decoder.

The 24 existing browser groups continue to cover mixed readings/actions, exact
instances, automatic Boolean toggle arguments, ordinary required arguments,
explicit reorder/save, cancellation, load failure, uncertain saves, late discovery
and closed-watch public catalogue fallback. Seven added groups cover:

- An app-only pin selected by name, without a UUID or source/action requirement.
  New untouched names/icons get sensible defaults; edited or existing names/icons
  stay unchanged. A plugin UUID is never treated as its watchapp destination.
- Saved unknown UUIDs and custom Czech labels surviving reopen, offline/empty
  search, local Done and an actual settings Save. Other capability edits and
  Cancel cannot retarget or silently replace that saved destination.
- Explicit search only: typing makes no request. Enter performs a search rather
  than submitting the pin form. Errors, empty results and late plugin metadata
  preserve the app choice and draft label. Aborted responses are deliberately
  delivered late to exercise stale-response guards.
- A search returning after Cancel being unable to populate or select an app in
  a different editor. Add and all other pin-row buttons are disabled while an
  item is being edited; both Done and Cancel restore them.
- Choosing Do nothing removing only `openApp`, while the exact reading, toggle,
  confirmation and advanced action arguments remain unchanged.
- Store filtering to at most fifteen compatible watchapps, duplicate titles
  retaining distinct UUIDs, direct result buttons choosing the exact target and
  long Czech names producing valid defaults within the 32-byte UTF8 limits.
- Intercepted requests targeting the expected public-store endpoint, with no
  actual store request, credential validation or app launch during browser QA.

The mocked store uses the official response shape, including
`compatibility.emery.supported`. XHR is replaced before page execution and fetch
is rejected. Six explicit requests are intercepted. Real Dashboard source config
handlers run with separate SDK surfaces: PKJS can enumerate metadata, the closed
settings plugin cannot. These contexts make zero source reads, subscriptions,
action invocations or native messages. Actual bundled PKJS/plugin execution is
checked separately by `scripts/check-packaged.cjs`; browser bridge handlers are
source modules, as stated in the report. Explicit timeout injection is not part
of this browser run; it shares the tested XHR error callback.

The [API/permission notes](../../APP-PICKER.md) document current SDK limits and
the scoped Internet grant. The browser fixtures do not prove real WebView CORS,
permission dialogs, app installation or a physical app handoff. Store results
are labelled as store results, not an installed-app list. After an Internet
permission change, users must save edits and reopen settings for the new grant
to reach the page. Common and saved choices require no store request.

Final PBW SHA-256:
`ffc514ad8a0095fdc18fdfd049be294f21fe8e3e8eb365a75cdf23e121eb982a`.
Debug ZIP SHA-256:
`54c2de2459d245d7c80ac5489af1cd948ab5ccf2ffc03571993cd8f9d729e514`.
Earlier artifacts are recorded in [previous-artifacts.json](previous-artifacts.json).
No publication or real phone/physical-watch test is claimed.

```sh
source ../recovery-validation/env.sh
npm test
npm run build
npm run check:artifact
node scripts/check-packaged.cjs
node scripts/check-settings.cjs --pbw dist/Dashboard-0.4.0.pbw
```

The browser command extracts the archive's `config.html`, requires exact equality
with the current generated page and records archive/HTML hashes. It runs local
Chromium with fictional handlers and intercepted requests.
