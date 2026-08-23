# Desktop App (macOS)

The desktop app is a second client, not a replacement. It runs the same server, reads the same course library at `~/.courses`, and talks to the same Codex CLI. The only thing it changes is how the studio starts: a double-click instead of a terminal.

## Build and install

```bash
npm install
npm run desktop:install
```

That builds the client, stages the server, packages `Course Studio.app`, and copies it into `/Applications`. Launch it from Spotlight or the Dock like any other app.

| Command | What it does |
|---|---|
| `npm run desktop:dev` | Runs the shell against the Vite dev server. Needs `npm run dev` in another terminal. |
| `npm run desktop:build` | Builds the client and stages the app under `.desktop/app`. |
| `npm run desktop:pack` | Packages `Course Studio.app` into `.desktop/release`. |
| `npm run desktop:dist` | Packages a `.dmg` as well. |
| `npm run desktop:install` | Packages, then installs into `/Applications`. |
| `npm run release -- patch` | Bumps the version and pushes the tag that publishes a GitHub release. See [Releasing](#releasing). |

## How it coexists with the web app

On launch the app checks whether a studio server is already listening on port `4310`:

- **Nothing listening** — the app starts the server inside itself and opens a window onto it.
- **Something listening** — the app attaches to that server instead of starting a second one.

So `npm run dev` and the desktop app can be open at once. They share one server, one course library, and one Codex session, which is what keeps checkpoints from interleaving badly. The browser at `http://127.0.0.1:4310` stays a first-class way to use the studio.

The same environment variables work in both (`COURSE_STUDIO_LIBRARY`, `COURSE_STUDIO_PORT`, `CODEX_BIN`); the app reads them from the login shell it inherits.

### Finding `codex`

An app launched from Finder inherits a minimal `PATH` — `/usr/bin:/bin:/usr/sbin:/sbin` — which contains none of the places `codex` is normally installed (`/opt/homebrew/bin`, `~/.local/bin`, and so on). The shell works around this at startup by asking your login shell for its real `PATH`, then pinning `CODEX_BIN` to an absolute path. If the studio still reports that Codex is unavailable, set `CODEX_BIN` explicitly:

```bash
launchctl setenv CODEX_BIN "$(command -v codex)"
```

## Code signing and distribution

Building and running your own Mac app is fully supported by macOS. No App Store, no Apple Developer Program, no certificate.

The mechanism worth understanding is that **Gatekeeper does not check apps — it checks the `com.apple.quarantine` extended attribute**, and only the program that *downloads* a file sets that: a browser, Mail, Messages, AirDrop. An app you compiled locally never gets the attribute, so it launches with no prompt at all.

What that means in practice:

| Scenario | Works? | Cost |
|---|---|---|
| You build on your own Mac | Yes, no prompt | Free |
| You build on each of your Macs | Yes, no prompt | Free |
| You copy the built `.app` between your Macs over `rsync`, `scp`, or a USB drive | Yes, no prompt | Free |
| You AirDrop the built `.app` to another Mac | Prompts — AirDrop sets quarantine | Free |
| Someone else clones this repo and builds it | Yes, no prompt | Free |
| You publish a prebuilt `.dmg` and someone downloads it | Blocked until they override it by hand | $99/yr to fix properly |

Apple Silicon does require every binary to carry *some* signature, so `desktop/afterPack.mjs` applies an ad-hoc one (`codesign --sign -`). Ad-hoc signatures are free, need no Apple account, and are enough to run an app locally. They carry no identity, which is exactly why they do not satisfy Gatekeeper for downloaded apps.

**Tagged releases publish prebuilt `.dmg` and `.zip` builds anyway** — the last row of that table is a trade we take deliberately. The downloads exist so a second Mac, or anyone who would rather not install a toolchain, can still run the app; the cost is one `xattr` command after installing, which the release notes spell out. Building from source stays the recommended path precisely because it skips that step.

Making those downloads open with no extra step means an Apple Developer Program membership ($99/yr), a Developer ID Application certificate, and notarization — Apple scans the upload and issues a ticket that gets stapled to the app. Until that is worth paying for, anyone who downloads a release clears the quarantine attribute by hand, once:

```bash
xattr -dr com.apple.quarantine "/Applications/Course Studio.app"
```

On macOS 15 and later the old Control-click → Open shortcut no longer works for this; the GUI path is System Settings → Privacy & Security → **Open Anyway**.

## Releasing

A release is a version tag. `.github/workflows/release.yml` watches `v*`; pushing one is the whole trigger.

```bash
npm run release -- patch     # or minor, major, or an exact 1.2.3
```

`scripts/release.mjs` refuses to run from anything but a clean `main` that matches `origin/main`, runs the typecheck and the tests, then hands off to `npm version` — which writes the version, commits it, and creates the tag — and pushes both. Add `--dry-run` to see what it would do without touching anything.

From the tag, the workflow re-checks that the tag matches `package.json`, runs the tests, stages the app, and packages both architectures on an Apple Silicon runner:

```
course-studio-<version>-arm64.dmg    course-studio-<version>-arm64.zip
course-studio-<version>-x64.dmg      course-studio-<version>-x64.zip
SHA256SUMS.txt
```

Nothing in the app is a native module, so the Intel build cross-packages from the same runner. The release notes are GitHub's generated changelog with the install and quarantine instructions prepended.

Two things worth knowing:

- **Run the workflow by hand to rehearse it.** A `workflow_dispatch` run builds and checksums exactly the same assets and attaches them to the run, but publishes no release. That is how to find out that packaging broke without first cutting a tag.
- **A failed release is recoverable.** The tag exists as soon as it is pushed, so if the build fails, fix the cause, then `git tag -d vX.Y.Z && git push origin :vX.Y.Z` and release again. The workflow creates the release only after every earlier step has passed.

## Why not Pake

[Pake](https://github.com/tw93/pake) and similar tools wrap a URL in the system WebView. They are a good fit for an app that is genuinely just a hosted page. Course Studio is a page *plus* a local Node server that spawns the Codex CLI, shells out to `git`, and owns `~/.courses` — none of which a WebView wrapper ships. Pointing Pake at `http://127.0.0.1:4310` produces a native window showing a connection error until you start the server from a terminal, which is the step the desktop app exists to remove. See [ADR 0002](adr/0002-desktop-shell.md).
