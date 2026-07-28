# Language Policy

Course Studio supports English (`en`) and Simplified Chinese (`zh-CN`) as
first-class languages. This document is the development contract for language
behavior in the Studio chrome, agent conversation, and course files.

## Product behavior

- The language switch changes Studio-owned interface text immediately and is
  remembered in browser storage.
- English is the source locale and fallback. A missing translation must never
  make the interface unusable or render a translation key to the learner.
- The selected language is sent with every agent turn. Agent chat replies and
  newly authored course material use that language unless the learner explicitly
  asks for another language.
- Switching the Studio language does not silently translate or rewrite existing
  course files. Existing material stays intact until the learner asks the agent
  to translate it. Edits to existing material preserve its established language
  unless translation is part of the request.
- New course pages set the document's `<html lang>` to the selected language:
  `en` for English and `zh-CN` for Simplified Chinese.
- Learner-authored text, quotations, code, filenames, commands, API names, model
  names, and other proper nouns are preserved when translation would reduce
  accuracy. Explanations around them use the selected language.

## Development rules

1. Put every new learner-visible Studio string—including labels, buttons,
   placeholders, empty states, titles, tooltips, and accessibility text—in the
   catalog in `src/i18n.tsx`. Do not hard-code new UI copy in a component.
2. Add both the English and Simplified Chinese value in the same change. Tests
   may use English as the deterministic default, but language behavior must also
   be covered in Chinese when the change affects localization.
3. Use stable semantic keys. Components call `useI18n()` and render `t(key)`;
   they must not branch on the language to assemble unrelated layouts.
4. Keep language preference in the browser. Do not add localization state to a
   course directory or widen the Codex backend seam solely for UI translation.
5. Pass the selected language through the shared browser/server protocol for
   agent turns. Per-turn language instructions belong in
   `server/course/prompt.ts`; general multilingual writing quality belongs in
   `server/course/designGuide.ts`.
6. Do not use locale selection as permission to mutate a course. The existing
   intent-first edit contract still applies.
7. Layouts must tolerate longer copy and Chinese line breaking. Verify the
   welcome screen, top bar, course navigation, chat header, composer, and narrow
   viewport in both languages after changing shared UI.

## Adding another language

- Add the locale to the `Language` type and language options in `src/i18n.tsx`.
- Complete the full catalog before exposing it in the switch.
- Add the language name in its own language, prompt guidance, and tests.
- Update this document and verify that fallback, persistence, accessibility
  labels, and course `<html lang>` behavior remain correct.
