import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chat, type ChatHandle } from "./components/Chat";
import { CourseNav } from "./components/CourseNav";
import { Preview, type PreviewHandle } from "./components/Preview";
import { Toolbar } from "./components/Toolbar";
import { useStudio } from "./ws";
import type { CourseSection, Selection } from "./types";

export function App() {
  const { state, actions } = useStudio();
  const preview = useRef<PreviewHandle | null>(null);
  const chat = useRef<ChatHandle | null>(null);

  const [inspecting, setInspecting] = useState(false);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [chatOpen, setChatOpen] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const canInspect = state.course.hasContent;

  const stopInspecting = useCallback(() => setInspecting(false), []);

  // The course can disappear under us (a revert back to the blank canvas).
  useEffect(() => {
    if (!canInspect) setInspecting(false);
  }, [canInspect]);

  // The preview bridge handles Escape inside the course page; this covers the
  // same key when focus is anywhere in the studio chrome.
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape" && inspecting) setInspecting(false);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [inspecting]);

  const onSelection = useCallback((selection: Selection) => {
    setSelections((current) => {
      const index = current.findIndex((item) => item.id === selection.id);
      if (index < 0) return [...current, selection];
      return current.map((item) => (item.id === selection.id ? selection : item));
    });
    setInspecting(false);
    chat.current?.focusComposer();
  }, []);

  const onSelectSection = (section: CourseSection) => {
    setActiveSection(section.id ?? `index-${section.index}`);
    preview.current?.scrollToSection(section);
  };

  const send = (text: string) => {
    actions.sendTurn(text || "Explain this differently.", selections);
    setSelections([]);
  };

  const statusText = useMemo(() => {
    if (!state.connected) return "Studio reconnecting";
    if (state.codex.state === "starting") return "Starting Codex";
    if (state.codex.state === "error") return "Codex needs attention";
    return state.working ? "Agent is working" : "Codex ready";
  }, [state.codex.state, state.connected, state.working]);

  const placeholder = selections.length
    ? "What should change here?"
    : state.course.hasContent
      ? "Ask, or inspect part of the lesson…"
      : "What would you like to learn today?";

  return (
    <div className={`studio-shell ${chatOpen ? "chat-is-open" : "chat-is-closed"}`}>
      <CourseNav
        course={state.course}
        activeSection={activeSection}
        onSelectSection={onSelectSection}
        onChooseTopic={() => chat.current?.focusComposer()}
      />

      <main className="workspace">
        <Toolbar
          inspecting={inspecting}
          canInspect={canInspect}
          courseChanged={state.courseChanged}
          checkpoints={state.checkpoints}
          working={state.working}
          onToggleInspect={() => setInspecting((current) => !current)}
          onRevert={actions.revert}
        />
        <Preview
          ref={preview}
          courseVersion={state.courseVersion}
          inspecting={inspecting}
          courseChanged={state.courseChanged}
          codex={state.codex}
          onSelection={onSelection}
          onInspectCancelled={stopInspecting}
          onStartRequested={() => chat.current?.focusComposer()}
        />
      </main>

      <Chat
        ref={chat}
        codex={state.codex}
        statusText={statusText}
        connected={state.connected}
        working={state.working}
        items={state.items}
        open={chatOpen}
        selections={selections}
        placeholder={placeholder}
        onToggleOpen={setChatOpen}
        onExpandSelection={(id) => preview.current?.expandSelection(id)}
        onRemoveSelection={(id) => setSelections((current) => current.filter((item) => item.id !== id))}
        onSend={send}
        onInterrupt={actions.interrupt}
      />
    </div>
  );
}
