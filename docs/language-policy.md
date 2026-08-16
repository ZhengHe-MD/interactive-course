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

## Course localization & translation lifecycle

### 1. Monolingual co-creation loop
- Courses are initially authored in a single primary language (either English or Chinese).
- Maintaining dual languages simultaneously during rapid brainstorming and lesson authoring is forbidden to eliminate token waste, DOM bloat, and synchronization tax.

### 2. Sibling page localization (Fork B)
- When a lesson or syllabus is translated into another language, the agent creates a localized sibling file following the naming convention `<basename>.<lang>.html`:
  - `syllabus.html` $\rightarrow$ `syllabus.zh-CN.html`
  - `session1.html` $\rightarrow$ `session1.zh-CN.html`
- Sibling files are fully independent HTML files. Learners can navigate to and iteratively refine the translated sibling in Course Studio using the standard select-and-edit loop with the agent in that target language.

### 3. Three-tier technical terminology standard
Technical translation between English and Chinese follows a structured 3-tier convention:
- **Tier 1 (Universally Established Standard)**: Terms with a well-accepted, unambiguous Chinese translation are translated directly into standard Chinese (e.g. `梯度下降` for `Gradient Descent`, `反向传播` for `Backpropagation`, `过拟合` for `Overfitting`, `神经网络` for `Neural Network`).
- **Tier 2 (Emerging / Dual-Context Concepts)**: Terms that are recognizable in Chinese but benefit from English reference use the **First-Mention Bilingual Annotation** format: `中文译名 (Original English)` on the first occurrence in a page/lesson (e.g. `提示词注入 (Prompt Injection)`, `向量嵌入 (Vector Embedding)`, `交叉熵 (Cross-Entropy)`), and standard Chinese thereafter.
- **Tier 3 (Jargon / Unstable Terms / Tooling / Code)**: Terms without consistent consensus translation, or where translation creates unnecessary confusion, retain the original English term (e.g. `Token`, `Transformer`, `LoRA`, `Dropout`, `Fine-tuning`, `Zero-shot`, `PyTorch`, `git commit`, `localStorage`).

### 4. Chinese typography spacing (盘古之白)
- Always insert a single half-width space between Chinese characters and English words or Arabic numerals (e.g. `在对模型进行 Fine-tuning 时，将学习率设为 0.001`).

### 5. Interactive widget & JavaScript safety contract
Interactive elements, quizzes, and simulations must remain completely functional during translation:
- **Strictly Preserved**: All HTML `id`, `class`, `name`, and `data-*` attributes; all JavaScript variable names, function names, logic operators, math formulas, canvas render loops, event listener bindings, and `localStorage` keys.
- **Translated**: User-visible prose, headings, quiz questions, answer choices, explanation callouts, hover tooltips, button labels, and user-facing feedback string literals in JavaScript (e.g. `feedbackEl.textContent = "回答正确！原理解析..."`).

### 6. Co-Design companion translation
- When translating a course or session, recorded conversations in `conversations.json` and design rationale notes are also translated following the same 3-tier standard, ensuring the standalone exported companion drawer presents a natural localized co-design story.

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
