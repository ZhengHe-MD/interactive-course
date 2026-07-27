import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chat, type ChatHandle } from "./components/Chat";
import { CourseNav } from "./components/CourseNav";
import { Preview, type PreviewHandle } from "./components/Preview";
import { collapseToLatestSelection, mergeSelection } from "./selection";
import { Toolbar } from "./components/Toolbar";
import { Welcome } from "./components/Welcome";
import { useStudio } from "./ws";
import type { CoursePage, CourseSection, Selection } from "./types";

export function App() {
  const { state, actions } = useStudio();
  const preview = useRef<PreviewHandle | null>(null);
  const chat = useRef<ChatHandle | null>(null);

  const [inspecting, setInspecting] = useState(false);
  const [multipleSelection, setMultipleSelection] = useState(false);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [chatOpen, setChatOpen] = useState(true);
  const [activePage, setActivePage] = useState("syllabus.html");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [birthTopic, setBirthTopic] = useState<string | null>(null);
  const [startingNewCourse, setStartingNewCourse] = useState(false);
  const sawNewCourseEmpty = useRef(false);
  const syllabusCourse = useRef<string | null>(null);
  const visiblePage = state.course.pages.find((page) => page.path === activePage)?.path
    ?? state.course.pages[0]?.path
    ?? activePage;

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
    const pageSelection = { ...selection, page: visiblePage };
    setSelections((current) => mergeSelection(current, pageSelection, multipleSelection));
    chat.current?.focusComposer();
  }, [multipleSelection, visiblePage]);

  const toggleMultipleSelection = () => {
    if (multipleSelection) {
      const kept = collapseToLatestSelection(selections);
      const keptId = kept[0]?.id;
      for (const selection of selections) {
        if (selection.id !== keptId) preview.current?.removeSelection(selection.id);
      }
      setSelections(kept);
    }
    setMultipleSelection((current) => !current);
  };

  useEffect(() => {
    const pages = state.course.pages;
    if (pages.length && !pages.some((page) => page.path === activePage)) {
      setActivePage(pages[0].path);
      setActiveSection(null);
    }
  }, [activePage, state.course.pages]);

  useEffect(() => {
    if (state.course.phase === "syllabus") syllabusCourse.current = state.courseId;
    const firstLesson = state.course.pages.find((page) => page.kind === "lesson");
    if (state.course.phase === "learning" && syllabusCourse.current === state.courseId && firstLesson) {
      setActivePage(firstLesson.path);
      setActiveSection(null);
      syllabusCourse.current = null;
    }
  }, [state.course.phase, state.course.pages, state.courseId]);

  const onSelectSection = (section: CourseSection) => {
    setActiveSection(section.id ?? `index-${section.index}`);
    preview.current?.scrollToSection(section);
  };

  const onSelectPage = (page: CoursePage) => {
    setActivePage(page.path);
    setActiveSection(null);
    setSelections([]);
    setInspecting(false);
  };

  const send = (text: string) => {
    actions.sendTurn(text || "Explain this differently.", selections, visiblePage);
    setSelections([]);
    preview.current?.clearSelections();
  };

  const startCourse = (topic: string) => {
    setBirthTopic(topic);
    setStartingNewCourse(true);
    sawNewCourseEmpty.current = false;
    setShowWelcome(false);
    setSelections([]);
    setActivePage("syllabus.html");
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
    setActivePage("syllabus.html");
    setActiveSection(null);
    setInspecting(false);
    actions.openCourse(courseId);
  };

  const switchConversation = (conversationId: string) => {
    if (conversationId === state.conversationId) return;
    setSelections([]);
    setInspecting(false);
    actions.openConversation(conversationId);
  };

  const newConversation = () => {
    setSelections([]);
    setInspecting(false);
    actions.newConversation();
  };

  const statusText = useMemo(() => {
    if (!state.connected) return "Studio reconnecting";
    if (state.codex.state === "starting") return "Starting Codex";
    if (state.codex.state === "error") return "Codex needs attention";
    return state.working ? "Agent is working" : "Codex ready";
  }, [state.codex.state, state.connected, state.working]);

  const placeholder = selections.length
    ? "Ask about this, or tell the agent what to change…"
    : state.course.phase === "syllabus"
      ? "Ask for changes, or approve the syllabus…"
      : state.course.hasContent
      ? "Ask, or select part of the lesson…"
      : "What would you like to learn today?";

  const hasDesignHistory = state.items.some((item) => item.kind === "user")
    || state.conversations.some((conversation) => conversation.title !== "New conversation");

  if (!state.course.hasContent && !birthTopic && !hasDesignHistory) {
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
    : !state.course.hasContent && state.conversationId
      ? {
          ...state.course,
          title: state.conversations.find((conversation) => conversation.id === state.conversationId)?.title
            ?? state.course.title,
          topic: "Course interview",
        }
      : state.course;

  return (
    <div className={`studio-shell ${chatOpen ? "chat-is-open" : "chat-is-closed"}`}>
      <Toolbar
        courseTitle={displayCourse.title}
        courseId={state.courseId}
        courses={state.courses}
        inspecting={inspecting}
        multipleSelection={multipleSelection}
        canInspect={canInspect}
        courseChanged={state.courseChanged}
        checkpoints={state.checkpoints}
        working={state.working}
        onHome={() => setShowWelcome(true)}
        onSwitchCourse={switchCourse}
        onToggleInspect={() => setInspecting((current) => !current)}
        onToggleMultipleSelection={toggleMultipleSelection}
        onRevert={actions.revert}
      />

      <div className="studio-body">
        <CourseNav
          course={displayCourse}
          activePage={visiblePage}
          activeSection={activeSection}
          working={state.working}
          onSelectPage={onSelectPage}
          onSelectSection={onSelectSection}
          onChooseTopic={() => chat.current?.focusComposer()}
        />

        <main className="workspace">
          <Preview
            ref={preview}
            courseVersion={state.courseVersion}
            pagePath={visiblePage}
            inspecting={inspecting}
            multipleSelection={multipleSelection}
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
          phase={state.course.phase}
          items={state.items}
          conversationId={state.conversationId}
          conversations={state.conversations}
          open={chatOpen}
          selections={selections}
          placeholder={placeholder}
          onToggleOpen={setChatOpen}
          onNewConversation={newConversation}
          onSwitchConversation={switchConversation}
          onExpandSelection={(id) => preview.current?.expandSelection(id)}
          onRemoveSelection={(id) => {
            preview.current?.removeSelection(id);
            setSelections((current) => current.filter((item) => item.id !== id));
          }}
          onSend={send}
          onInterrupt={actions.interrupt}
        />
      </div>
    </div>
  );
}
