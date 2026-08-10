# Course Studio Context

A local studio for co-designing personalized interactive HTML courses with a coding agent.

## Language

### Course Artifacts

**Course Package**:
A portable, editable `.zip` archive containing a course's source files, assets, metadata, and conversation history (`conversations.json`) for transfer between Course Studio instances.
_Avoid_: Export bundle, course archive, backup dump

**Standalone Export**:
A self-contained, single-file HTML reader containing bundled course pages, inlined assets, and a collapsible read-only Co-Design Companion Drawer for publishing on personal websites or reading outside Course Studio.
_Avoid_: Build, distribution bundle, compiled course

**Course**:
A self-contained directory of plain HTML, CSS, JavaScript, assets, metadata (`course.json`), design briefs (`COURSE.md`), and conversation history (`conversations.json`) representing an interactive learning experience.
_Avoid_: Project, module, lesson folder

**Course Library**:
The parent directory (`~/.courses` by default) housing individual course directories and their path-scoped Git checkpoints.
_Avoid_: Workspace, repo root, catalog

**Checkpoint**:
A path-scoped Git commit within the course library repository capturing the exact file state of a course after a turn.
_Avoid_: Snapshot, savepoint, backup

**Conversation Transcript**:
A structured record of learner prompts, agent responses, and reasoning summaries stored in `conversations.json` within the course directory.
_Avoid_: Chat log, debug dump, telemetry stream

**Co-Design Companion**:
A toggleable read-only drawer or pane in the Standalone Export presenting the historical dialogue, questions, and reasoning behind the course design.
_Avoid_: Chat replay, debug sidebar
