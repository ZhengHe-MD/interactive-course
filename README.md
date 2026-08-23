<p align="center">
  <img src="public/brand/lockup.svg" alt="Course Studio" width="340" />
</p>

<p align="center">
  <strong>An AI workspace for co-designing interactive, personalized web courses.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README_zh.md">简体中文</a>
</p>

---

## What is Course Studio?

Course Studio turns learning any subject into a collaborative experience with AI. Instead of reading a static textbook or scrolling through chat replies, Course Studio builds a **live, interactive HTML course** tailored to you.

As you read, you can highlight text or select visual elements to ask questions, request simpler explanations, or ask for interactive sandboxes, simulations, and quizzes.

## How it works

1. **Start with a topic** — Tell Course Studio what you want to learn. The AI designs a custom syllabus for your background and goals.
2. **Learn by doing** — Read bite-sized lessons with built-in interactive widgets, diagrams, and self-checks.
3. **Point and customize** — Highlight any sentence or click any block to ask questions or reshape the course in real time.

## Key Features

- 🎯 **Interactive Sandboxes & Visuals** — Courses aren't just markdown text. Lessons include live simulations, sliders, and quizzes to build deep intuition.
- ✍️ **Point-and-Ask Context** — Select any part of a lesson to ask for clarification, deeper examples, or visual rewrites.
- ⏪ **Safe to Explore (Undo / Revert)** — Every AI update creates an automatic Git checkpoint. Revert or branch anytime with one click.
- 🌐 **Zero Build Step** — Courses are standard HTML, CSS, and JavaScript stored locally in `~/.courses/`. No bundlers or build tools required.
- 📦 **Standalone Single-File Export** — Export your entire course into a single, self-contained HTML file that opens in any browser—offline, zero dependencies.
- 🌍 **Bilingual by Design** — First-class support for both English and Simplified Chinese (UI, AI chat, and generated courses).

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 24 or newer
- [Codex CLI](https://github.com/openai/codex) installed and authenticated (`codex login`)

### Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4311](http://127.0.0.1:4311) in your browser.

> **Production build**: Run `npm run build && npm start`, then open [http://127.0.0.1:4310](http://127.0.0.1:4310).

### Desktop app (macOS)

Prefer a real app to a terminal and a browser tab? Build and install one:

```bash
npm run desktop:install
```

That puts `Course Studio.app` in `/Applications`. It runs the same server and the same course library — the web app is unchanged and stays fully supported. If a studio server is already running, the desktop app attaches to it instead of starting a second one, so a browser tab and the app can be open at once.

Building your own Mac app needs no Apple Developer account and no App Store: an app you compile locally carries no quarantine attribute, so it just launches. Anyone who clones this repo can build it the same way. See [docs/desktop-app.md](docs/desktop-app.md) for the details, including what would change if prebuilt downloads were ever published.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `COURSE_STUDIO_LIBRARY` | `~/.courses` | Directory where courses and their Git histories are stored |
| `COURSE_STUDIO_COURSE` | `current` | Active course folder name |
| `COURSE_STUDIO_PORT` | `4310` | Studio server port |
| `CODEX_BIN` | `codex` | Custom path to the Codex CLI binary |

## Export & Share

Click **Export** in the top bar to package your course:
- **Standalone HTML**: Bundles all lessons, styles, and interactive widgets into a single `.html` file.
- **Course Package**: Exports a portable `.course.zip` archive with full Git history and conversation notes for sharing or importing.

## Learn More

- [DESIGN.md](DESIGN.md) — Architecture decisions and core principles
- [AGENTS.md](AGENTS.md) — How the AI agent reasons and creates courses
- [docs/desktop-app.md](docs/desktop-app.md) — Building, installing, and code-signing the macOS app
- [docs/language-policy.md](docs/language-policy.md) — Bilingual design contract
