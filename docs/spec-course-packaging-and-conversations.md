# Specification: Course Packaging, Self-Contained Transcripts, and Read-Only Publication

## Problem Statement

Course Studio learners currently create courses that are stored exclusively in a single machine's local Course Library. Learners who switch between multiple devices (e.g. laptop, desktop) have no straightforward way to package, transfer, or synchronize an editable course without manually manipulating files or dealing with machine-local agent database state. Furthermore, when publishing or sharing a finished course on a personal website (such as GitHub Pages), the co-design story—the rich questions, answers, and pedagogical reasoning that brought the course to life—is lost because standalone exports contain only the raw course content.

## Solution

1. **Course Package (`.zip`)**: A portable, self-contained `.zip` archive containing course source files, assets, `COURSE.md`, `course.json`, and `conversations.json`. Learners can export a course package in one click and import it on any device via file picker or drag-and-drop, with collision handling ("Replace existing" vs "Import as new copy").
2. **Self-Contained Conversation Persistence**: Course Studio maintains `conversations.json` inside each course directory on disk, capturing learner prompts, agent answers, and high-level reasoning summaries. On imported devices, historical sessions are presented as read-only, and new turns start in a fresh session.
3. **Co-Design Companion in Standalone Exports**: The standalone single-file HTML export embeds a toggleable, read-only Co-Design Companion drawer that lets readers on personal sites inspect the historical Q&A and reasoning dialogue that shaped each lesson without cluttering the primary learning experience.

## User Stories

1. As a course author, I want to export my entire course as an editable `.course.zip` package from the Studio, so that I can easily transfer my work to another device.
2. As a course author, I want to import a `.course.zip` package via a file picker or by dragging and dropping it into Course Studio, so that I can resume co-designing a course on a second computer.
3. As a course author importing a package that matches an existing course name, I want to be prompted to either replace the existing course or import it as a duplicate copy, so that I never accidentally overwrite my work.
4. As a course author on a new device, I want imported conversation history to appear as read-only historical sessions in the chat history dropdown, so that I can reference past discussions while starting new turns in a clean local session.
5. As a course author, I want all course prompts, agent responses, and reasoning summaries to be automatically recorded to `conversations.json` in the course directory, so that the course directory is completely self-contained and decoupled from machine-local agent databases.
6. As a course publisher, I want to export a standalone single-file HTML reader with an embedded Co-Design Companion drawer, so that I can host the course on my GitHub Pages personal site (`ZhengHe-MD.github.io`) with full pedagogical transparency.
7. As a learner reading an exported standalone course on a personal site, I want a clean, distraction-free reading experience by default, so that I can focus on the interactive learning material.
8. As a curious reader on a personal site, I want to open the Co-Design Companion drawer at any time, so that I can see the exact questions the author asked and the AI mentor's pedagogical reasoning.
9. As a reader exploring the Co-Design Companion drawer, I want reasoning summaries to be presented as expandable badges on relevant turns, so that I can dive into the authoring rationale without being overwhelmed by verbose text.
10. As a bilingual user (English / Simplified Chinese), I want all new packaging modals, import collision prompts, and standalone companion drawer labels to be fully translated in both languages, so that the studio adheres to the bilingual product contract.
11. As a course author, I want course package archives to be clean standard `.zip` files containing plain HTML/CSS/JS, so that I can inspect or modify the files with standard operating system tools if desired.
12. As a course author, I want imported course packages to automatically initialize an initial Git checkpoint in the Course Library, so that the timeline and undo capabilities work immediately on the new device.

## Implementation Decisions

### Modules and Capabilities

1. **Course Packaging Service**:
   - **Package Exporter**: Reads the course directory (excluding internal temp/cache files) and streams an uncompressed/compressed standard `.zip` archive containing HTML files, CSS, JS, media assets, `course.json`, `COURSE.md`, and `conversations.json`.
   - **Package Importer**: Receives a `.zip` archive, validates that it contains valid entry files (`syllabus.html` or `index.html`), determines course ID conflicts, unpacks the content into the Course Library, and creates an initial Git checkpoint (`course(<id>): Imported course package`).

2. **Self-Contained Conversation Storage**:
   - Course Manager manages `conversations.json` in the course directory.
   - On turn completion, the server appends the new turn (prompt, agent answer, reasoning summaries, timestamp) to `conversations.json`.
   - On course open, the server loads `conversations.json` and broadcasts it to connected clients. If a session in `conversations.json` does not exist in the active local Codex instance, it is marked as `readOnly: true`.

3. **Standalone Export Enhancement (`Co-Design Companion`)**:
   - The standalone HTML builder embeds the filtered `conversations.json` data into the export script.
   - The export shell HTML includes a toggle button ("Co-Design Notes / 共同设计对话") and a slide-out responsive drawer component.
   - The drawer renders the chronological list of learner questions, agent responses, and collapsible reasoning badges.

4. **UI Integration**:
   - **Export Modal**: Updated to offer two distinct export formats:
     - *Standalone HTML Reader* (Single `.html` file with embedded reader & companion drawer for hosting/sharing).
     - *Editable Course Package* (Portable `.zip` archive for multi-device transfer).
   - **Course Switcher**: Includes an "Import Course…" button opening a file picker.
   - **Drag-and-Drop Handler**: Studio preview surface accepts dropped `.course.zip` or `.zip` files.
   - **Collision Modal**: If the imported course ID matches an existing course, prompts the user: *"A course with this name already exists. Do you want to replace it or import as a new copy?"*

### Data Schemas

#### `conversations.json` Schema:
```json
{
  "version": 1,
  "conversations": [
    {
      "id": "conv-1",
      "title": "Course Initialization",
      "createdAt": "2026-08-10T20:00:00.000Z",
      "turns": [
        {
          "id": "turn-1",
          "prompt": "Let's create a course on CMOS gates...",
          "response": "Here is the syllabus...",
          "reasoning": [
            "Analyzed silicon physics prerequisites",
            "Structured interactive truth table"
          ],
          "createdAt": "2026-08-10T20:00:15.000Z"
        }
      ]
    }
  ]
}
```

### API Contracts

- `POST /api/package/export`: Generates and downloads `<course-id>.course.zip`.
- `POST /api/package/import`: Accepts a multipart/form-data zip upload or stream with query param `onConflict=replace|copy`. Returns `{ ok: true, courseId: string }`.
- `GET /api/package/check`: Checks if a proposed course ID already exists before unpacking.

## Testing Decisions

- **Good Test Philosophy**: Test external behavior at the highest possible seams (HTTP API endpoints, exported bundle contracts, and end-to-end import/export workflows), never private implementation details.
- **Modules Tested**:
  1. **Course Packaging**: Tests verifying that exporting a course produces a valid `.zip` containing all assets, `COURSE.md`, and `conversations.json`, and that importing the `.zip` recreates the course directory and commits a clean Git checkpoint.
  2. **Import Conflict Handling**: Tests verifying that `onConflict=copy` creates a deduplicated course slug and preserves the existing course, while `onConflict=replace` overwrites cleanly.
  3. **Standalone Export with Co-Design Companion**: Tests asserting that standalone HTML exports include both TIL metadata (`<!-- til:body -->`) and the serialized companion drawer data, while correctly displaying the toggle UI and reasoning summaries.
  4. **Transcript Persistence**: Tests verifying that completing a turn writes to `conversations.json` in the course directory and survives server restarts.
  5. **Bilingual Contract**: Tests asserting that all new UI components and companion drawer copy render correctly in English and Simplified Chinese.
- **Prior Art**: Existing Vitest suites in `tests/course-export.test.ts`, `tests/course-library.test.ts`, `tests/course-manager.test.ts`, and `tests/i18n.test.tsx`.

## Out of Scope

- Automated cloud-provider direct OAuth sync (Google Drive / GitHub API integration) — deferred in favor of direct `.zip` packaging and cloud-folder hosting.
- Live real-time collaborative editing between two simultaneous devices.
- Merging diverged multi-device branch histories (read-only historical sessions are supported; automatic 3-way conversation turn merging will be considered in a future milestone).

## Further Notes

- Standalone HTML reader remains 100% self-contained with no external dependencies (zero CDN links, all CSS and JS inlined).
- Course files remain plain HTML/CSS/JS with zero build steps per founding `DESIGN.md` hard rules.
