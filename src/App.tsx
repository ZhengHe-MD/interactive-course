import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chat, type ChatHandle } from "./components/Chat";
import { CourseNav } from "./components/CourseNav";
import { Preview, type PreviewHandle } from "./components/Preview";
import { Toolbar } from "./components/Toolbar";
import { Welcome } from "./components/Welcome";
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
  const [showWelcome, setShowWelcome] = useState(false);
  const [birthTopic, setBirthTopic] = useState<string | null>(null);
  const [startingNewCourse, setStartingNewCourse] = useState(false);
  const sawNewCourseEmpty = useRef(false);

  const canInspect = state.course.hasContent && !startingNewCourse;

  const stopInspecting = useCallback(() => setInspecting(false), []);

  // The course can disappear under us (a revert back to the blank canvas).
  useEffect(() => {
    if (!canInspect) setInspecting(false);
  }, [canInspect]);

  // Keep the previous course out of view from the moment a new topic is
  // submitted. Once the new directory either receives content or the start
  // request fails before switching, normal rendering can resume.
  useEffect(() => {
    if (!startingNewCourse) return;
    if (!state.course.hasContent) {
      sawNewCourseEmpty.current = true;
      return;
    }
    if (sawNewCourseEmpty.current || !state.working) {
      setStartingNewCourse(false);
      setBirthTopic(null);
      sawNewCourseEmpty.current = false;
    }
  }, [startingNewCourse, state.course.hasContent, state.working]);

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

  const startCourse = (topic: string) => {
    setBirthTopic(topic);
    setStartingNewCourse(true);
    sawNewCourseEmpty.current = false;
    setShowWelcome(false);
    setSelections([]);
    setActiveSection(null);
    setInspecting(false);
    actions.startCourse(topic);
  };

  const switchCourse = (courseId: string) => {
    if (courseId === state.courseId) return;
    setBirthTopic(null);
    setStartingNewCourse(false);
    sawNewCourseEmpty.current = false;
    setShowWelcome(false);
    setSelections([]);
    setActiveSection(null);
    setInspecting(false);
    actions.openCourse(courseId);
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

  if (!state.course.hasContent && !birthTopic) {
    return (
      <Welcome
        connected={state.connected}
        hasCourse={false}
        working={state.working}
        courseId={state.courseId}
        courses={state.courses}
        onBack={() => undefined}
        onSwitchCourse={switchCourse}
        onStart={startCourse}
      />
    );
  }

  if (showWelcome) {
    return (
      <Welcome
        connected={state.connected}
        hasCourse={state.course.hasContent}
        working={state.working}
        courseId={state.courseId}
        courses={state.courses}
        onBack={() => setShowWelcome(false)}
        onSwitchCourse={switchCourse}
        onStart={startCourse}
      />
    );
  }

  const displayCourse = !state.course.hasContent && birthTopic
    ? { ...state.course, title: birthTopic, topic: "Course outline" }
    : state.course;

  return (
    <div className={`studio-shell ${chatOpen ? "chat-is-open" : "chat-is-closed"}`}>
      <Toolbar
        courseTitle={displayCourse.title}
        courseId={state.courseId}
        courses={state.courses}
        inspecting={inspecting}
        canInspect={canInspect}
        courseChanged={state.courseChanged}
        checkpoints={state.checkpoints}
        working={state.working}
        onHome={() => setShowWelcome(true)}
        onSwitchCourse={switchCourse}
        onToggleInspect={() => setInspecting((current) => !current)}
        onRevert={actions.revert}
      />

      <div className="studio-body">
        <CourseNav
          course={displayCourse}
          activeSection={activeSection}
          working={state.working}
          onSelectSection={onSelectSection}
          onChooseTopic={() => chat.current?.focusComposer()}
        />

        <main className="workspace">
          <Preview
            ref={preview}
            courseVersion={state.courseVersion}
            inspecting={inspecting}
            courseChanged={state.courseChanged}
            codex={state.codex}
            startingTopic={startingNewCourse ? birthTopic ?? undefined : undefined}
            working={state.working}
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
    </div>
  );
}
