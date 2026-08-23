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

**This repo ships no prebuilt binaries, by design.** Anyone who wants the desktop client builds it from source, which keeps the whole thing free and avoids the download friction entirely.

If you ever do want to publish a downloadable build, the requirements are an Apple Developer Program membership ($99/yr), a Developer ID Application certificate, and notarization — Apple scans the upload and issues a ticket that gets stapled to the app. Until then, anyone who downloads an unsigned build has to clear the quarantine attribute by hand:

```bash
xattr -dr com.apple.quarantine "/Applications/Course Studio.app"
```

On macOS 15 and later the old Control-click → Open shortcut no longer works for this; the GUI path is System Settings → Privacy & Security → **Open Anyway**.

## Why not Pake

[Pake](https://github.com/tw93/pake) and similar tools wrap a URL in the system WebView. They are a good fit for an app that is genuinely just a hosted page. Course Studio is a page *plus* a local Node server that spawns the Codex CLI, shells out to `git`, and owns `~/.courses` — none of which a WebView wrapper ships. Pointing Pake at `http://127.0.0.1:4310` produces a native window showing a connection error until you start the server from a terminal, which is the step the desktop app exists to remove. See [ADR 0002](adr/0002-desktop-shell.md).
