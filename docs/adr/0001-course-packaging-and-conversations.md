# 0001: Course Packaging, Self-Contained Transcripts, and Read-Only Publication

## Context and Decision

Course Studio previously stored course files in `~/.courses` with Git checkpoints, while agent conversations lived exclusively inside Codex `app-server`'s local session database, and standalone HTML exports explicitly excluded transcripts (DESIGN.md decision 14).

We decided to:
1. **Define a portable Course Package format (`.zip`)**: Courses can be exported and imported as self-contained `.zip` archives containing course source files, assets, `COURSE.md`, `course.json`, and `conversations.json`.
2. **Persist conversation transcripts directly in the course directory (`conversations.json`)**: Each course records learner prompts, agent responses, and high-level reasoning summaries on disk. On imported devices, imported conversation sessions are displayed as read-only historical sessions, with new co-design turns proceeding in a fresh session initialized on the active device.
3. **Amend Decision 14 (Publication with Co-Design Companion)**: The standalone single-file HTML export for personal site publishing (`ZhengHe-MD.github.io`) embeds a collapsible, read-only **Co-Design Companion** drawer so readers can inspect the pedagogical questions, answers, and reasoning that shaped the course.
4. **UI Integration**:
   - **Export**: Integrated into the Export modal (choice between *Standalone HTML Reader* and *Editable Course Package (.zip)*).
   - **Import**: Accessible in the Course Switcher menu with an "Import Course…" file picker and full drag-and-drop support on the Studio interface. On naming collision, provides an interactive prompt ("Replace existing" vs "Import as new copy").

## Considered Options

- **Option 1: Git-remote / Cloud-drive synchronization only**: Rejected for initial implementation in favor of explicit zip package import/export to eliminate external cloud dependencies while enabling instant multi-device portability.
- **Option 2: Excluding conversation history from exports**: Rejected because preserving the co-design dialogue provides substantial pedagogical context and transparency for readers on personal websites.
- **Option 3: Full uncurated protocol logs in transcripts**: Rejected in favor of curated learner prompts, agent answers, and reasoning summaries to avoid leaking internal JSON-RPC wire artifacts while keeping substantive insights.

## Consequences

- Standalone HTML exports embed conversation data into the single-file reader and include bilingual UI labels for opening the Co-Design Companion drawer.
- Importing a `.zip` package on a new device restores historical conversations as read-only sessions and initializes a Git checkpoint.
- Future multi-device back-and-forth design will be able to merge `conversations.json` turns cleanly.
