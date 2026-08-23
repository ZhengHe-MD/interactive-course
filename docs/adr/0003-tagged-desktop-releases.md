# 0003: Tagged Desktop Releases

## Context and Decision

ADR 0002 decision 5 chose to ship no prebuilt binaries: the desktop app is built from source and ad-hoc signed, which costs nothing, needs no Apple account, and sidesteps Gatekeeper entirely because a locally compiled app never carries the quarantine attribute.

That reasoning holds only while every Mac that runs the studio also carries the toolchain. It stops holding as soon as a change has to reach a machine that is not the development machine: "build it from source" then means installing Node, cloning the repo, and running a packaging step before anyone can see a fix that already exists. The app is also versioned — `package.json` flows into the packaged `Info.plist` — with nothing marking which commit a given `Course Studio.app` was built from.

We decided to:

1. **Make a version tag the release.** `npm run release -- <patch|minor|major|x.y.z>` (`scripts/release.mjs`) bumps the version, tags it, and pushes; `.github/workflows/release.yml` watches `v*` and does the rest. Nothing is uploaded by hand, and there is no way to publish a release that does not correspond to a tagged commit.
2. **Publish ad-hoc signed downloads, and document the quarantine step.** This amends ADR 0002 decision 5. A `.dmg` and a `.zip` per architecture are attached to each release alongside `SHA256SUMS.txt`, and the release notes open with the `xattr -dr com.apple.quarantine` command that a downloaded ad-hoc signed app requires.
3. **Keep building from source the recommended path.** It is still the only route that involves no Gatekeeper step at all, and the README leads with it. The downloads are the fallback, not the headline.
4. **Cross-package both architectures on one Apple Silicon runner.** Nothing in the app is a native module — the server and shell are bundled by esbuild, and the one runtime dependency (`html2canvas`) is pure JavaScript — so the Intel build needs no Intel runner.
5. **Treat the tag as the version's source of truth.** The workflow fails before building if the tag does not match `package.json`, so a release's number, its `Info.plist`, and its asset filenames can never disagree.

## Considered Options

- **Option 1: Keep shipping no binaries.** Rejected. It is the reason a one-line fix cannot reach a second Mac without a toolchain, which is the friction this ADR exists to remove.
- **Option 2: Pay for a Developer ID and notarize.** Deferred, not rejected. $99/yr buys a download that opens with no prompt. Worth revisiting if the app ever has users who are not the author; until then a documented one-time `xattr` is a fair price for free distribution.
- **Option 3: Publish a build on every push to `main`.** Rejected. A release is a decision about what is ready, not a side effect of merging. Manual `workflow_dispatch` runs cover the "does packaging still work" question without publishing anything.
- **Option 4: Bump and tag from a `workflow_dispatch` job instead of locally.** Rejected. A tag pushed with `GITHUB_TOKEN` does not trigger other workflows, so this needs either a personal access token or a single job that both tags and builds — more moving parts than one local command, and it moves the release decision away from a working tree that has just passed its tests.
- **Option 5: Wire up `electron-updater` for in-app updates.** Rejected for now. It wants a signed, notarized app to update into, and it would add an update server contract to a project whose users currently number one.

## Consequences

- The repo now carries binaries. They are unsigned in the sense that matters to Gatekeeper, so anyone who downloads one has a documented extra step, and the release notes carry it rather than assuming anyone reads `docs/desktop-app.md`.
- macOS runner minutes are billed at ten times the Linux rate, which is free for this public repo but would not be if it went private. Releases only run on tags and manual dispatches, never on push.
- Each release attaches roughly 500 MB of assets. GitHub does not bill for release storage, but the number is worth knowing before releasing often.
- `electron-builder` also emits `.blockmap` files for delta updates. They are not published, because nothing consumes them without an updater.
- Windows and Linux remain unpackaged. `electron-builder.yml` configures only macOS, and the icon pipeline in `desktop/build.mjs` is Apple-toolchain specific.
