import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chat, type ChatHandle } from "./components/Chat";
import { CourseNav } from "./components/CourseNav";
import { ExportDialog } from "./components/ExportDialog";
import { ImportConflictModal } from "./components/ImportConflictModal";
import { Preview, type PreviewHandle } from "./components/Preview";
import { readReadingPosition, writeReadingPosition, type ReadingPosition } from "./readingPosition";
import { collapseToLatestSelection, mergeSelection } from "./selection";
import { Toolbar } from "./components/Toolbar";
import { Welcome } from "./components/Welcome";
import { useI18n } from "./i18n";
import { useStudio } from "./ws";
import type { AgentConfig, CoursePage, CourseSection, Selection } from "./types";

const DEFAULT_CHAT_WIDTH = 384;
const MIN_CHAT_WIDTH = 320;
const MAX_CHAT_WIDTH = 720;
const MIN_COURSE_WIDTH = 320;
const RESIZE_HANDLE_WIDTH = 7;

function storedChatWidth() {
  if (typeof window === "undefined") return DEFAULT_CHAT_WIDTH;
  const width = Number(window.localStorage.getItem("course-studio-chat-width"));
  return Number.isFinite(width)
    ? Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, width))
    : DEFAULT_CHAT_WIDTH;
}

export function App() {
  const { state, actions } = useStudio();
  const { language, t } = useI18n();
  const preview = useRef<PreviewHandle | null>(null);
  const chat = useRef<ChatHandle | null>(null);
  const readingSection = useRef<CourseSection | undefined>(undefined);

  const [inspecting, setInspecting] = useState(false);
  const [multipleSelection, setMultipleSelection] = useState(false);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatWidth, setChatWidth] = useState(storedChatWidth);
  const [chatResizing, setChatResizing] = useState(false);
  const [courseNavOpen, setCourseNavOpen] = useState(() => (
    typeof window === "undefined"
      ? true
      : window.localStorage.getItem("course-studio-course-nav") !== "collapsed"
  ));
  const [activePage, setActivePage] = useState("syllabus.html");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [resumePosition, setResumePosition] = useState<ReadingPosition | null>(null);
  const [resumeCourseId, setResumeCourseId] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [birthTopic, setBirthTopic] = useState<string | null>(null);
  const [startingNewCourse, setStartingNewCourse] = useState(false);
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"standalone" | "package">("standalone");
  const [exportPrompt, setExportPrompt] = useState("");
  const [pendingImport, setPendingImport] = useState<{ file: File; courseId: string } | null>(null);
  const sawNewCourseEmpty = useRef(false);
  const syllabusCourse = useRef<string | null>(null);
  const studioBody = useRef<HTMLDivElement | null>(null);
  const resizingPointer = useRef<number | null>(null);
  const positionedCourse = useRef<string | null>(null);
  const visiblePage = state.course.pages.find((page) => page.path === activePage)?.path
    ?? state.course.pages[0]?.path
    ?? activePage;

  const canInspect = state.course.hasContent && !startingNewCourse;

  useEffect(() => {
    if (state.agentConfig) setAgentConfig(state.agentConfig);
  }, [state.agentConfig]);

  const stopInspecting = useCallback(() => {
    setInspecting(false);
    setSelections([]);
    preview.current?.clearSelections();
  }, []);

  const toggleInspect = useCallback(() => {
    setInspecting((current) => {
      if (current) {
        setSelections([]);
        preview.current?.clearSelections();
      }
      return !current;
    });
  }, []);

  const onReadingPosition = useCallback((top: number, section?: CourseSection) => {
    readingSection.current = section;
    setActiveSection(section ? section.id ?? `index-${section.index}` : null);
    writeReadingPosition(state.courseId, { page: visiblePage, top, section });
  }, [state.courseId, visiblePage]);

  useEffect(() => {
    window.localStorage.setItem("course-studio-chat-width", String(chatWidth));
  }, [chatWidth]);

  useEffect(() => {
    window.localStorage.setItem("course-studio-course-nav", courseNavOpen ? "expanded" : "collapsed");
  }, [courseNavOpen]);

  const availableChatWidth = useCallback(() => {
    const body = studioBody.current;
    if (!body) return MAX_CHAT_WIDTH;
    const bodyWidth = body.getBoundingClientRect().width;
    if (bodyWidth <= 780) return MAX_CHAT_WIDTH;
    const navWidth = body.querySelector<HTMLElement>(".course-nav")?.getBoundingClientRect().width ?? 0;
    return Math.max(
      MIN_CHAT_WIDTH,
      Math.min(MAX_CHAT_WIDTH, bodyWidth - navWidth - MIN_COURSE_WIDTH - RESIZE_HANDLE_WIDTH),
    );
  }, []);

  const updateChatWidth = useCallback((width: number) => {
    setChatWidth(Math.min(availableChatWidth(), Math.max(MIN_CHAT_WIDTH, width)));
  }, [availableChatWidth]);

  useEffect(() => {
    const fitChatToWindow = () => setChatWidth((width) => Math.min(width, availableChatWidth()));
    window.addEventListener("resize", fitChatToWindow);
    fitChatToWindow();
    return () => window.removeEventListener("resize", fitChatToWindow);
  }, [availableChatWidth, courseNavOpen]);

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
      if (event.key === "Escape" && inspecting) stopInspecting();
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [inspecting, stopInspecting]);

  const onSelection = useCallback((selection: Selection) => {
    const pageSelection = { ...selection, page: visiblePage };
    setSelections((current) => mergeSelection(current, pageSelection, multipleSelection));
    chat.current?.focusComposer();
  }, [multipleSelection, visiblePage]);

  const onSelectionRemoved = useCallback((id: string) => {
    setSelections((current) => current.filter((item) => item.id !== id));
  }, []);

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
    const pages = state.course.pages;
    if (!pages.length || positionedCourse.current === state.courseId) return;

    const saved = readReadingPosition(state.courseId);
    const savedPage = saved && pages.some((page) => page.path === saved.page) ? saved : null;
    const position = savedPage ?? { page: pages[0].path, top: 0 };
    positionedCourse.current = state.courseId;
    readingSection.current = savedPage?.section;
    setResumePosition(position);
    setResumeCourseId(state.courseId);
    setActivePage(position.page);
    setActiveSection(savedPage?.section ? savedPage.section.id ?? `index-${savedPage.section.index}` : null);
  }, [state.course.pages, state.courseId]);

  useEffect(() => {
    readingSection.current = resumeCourseId === state.courseId && resumePosition?.page === visiblePage
      ? resumePosition.section
      : undefined;
  }, [resumeCourseId, resumePosition, state.courseId, visiblePage]);

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
    const position = { page: page.path, top: 0 };
    writeReadingPosition(state.courseId, position);
    setResumePosition(position);
    setResumeCourseId(state.courseId);
    setActivePage(page.path);
    setActiveSection(null);
    setSelections([]);
    setInspecting(false);
  };

  const send = (text: string) => {
    actions.sendTurn(text || t("app.explainDifferently"), selections, visiblePage, readingSection.current, agentConfig ?? undefined, language);
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
    setResumePosition(null);
    setResumeCourseId(null);
    setActiveSection(null);
    setInspecting(false);
    actions.startCourse(topic, agentConfig ?? undefined, language);
  };

  const switchingCourse = useMemo(() => {
    if (!state.switchingCourseId) return null;
    const target = state.courses.find((c) => c.id === state.switchingCourseId);
    return target ?? { id: state.switchingCourseId, title: state.switchingCourseId };
  }, [state.courses, state.switchingCourseId]);

  const switchCourse = (courseId: string) => {
    if (courseId === state.courseId || courseId === state.switchingCourseId) return;
    setBirthTopic(null);
    setStartingNewCourse(false);
    sawNewCourseEmpty.current = false;
    setShowWelcome(false);
    setSelections([]);
    setInspecting(false);
    setExportDialogOpen(false);
    actions.openCourse(courseId);
  };

  const returnToCourse = () => {
    const saved = readReadingPosition(state.courseId);
    if (saved && state.course.pages.some((page) => page.path === saved.page)) {
      setResumePosition(saved);
      setResumeCourseId(state.courseId);
      setActivePage(saved.page);
      setActiveSection(saved.section ? saved.section.id ?? `index-${saved.section.index}` : null);
    }
    setShowWelcome(false);
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

  const handleImportFile = async (file: File) => {
    if (importing || state.working || state.switchingCourseId) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      window.alert(t("toolbar.importFailed"));
      return;
    }
    const candidate = file.name
      .replace(/\.course\.zip$/i, "")
      .replace(/\.zip$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "") || "course";

    try {
      const checkRes = await fetch(`/api/package/check/${encodeURIComponent(candidate)}`);
      const checkData = (await checkRes.json()) as { exists: boolean };
      if (checkData.exists) {
        setPendingImport({ file, courseId: candidate });
        return;
      }
      await uploadCoursePackage(file, candidate, "copy");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t("toolbar.importFailed"));
    }
  };

  const uploadCoursePackage = async (file: File, requestedId: string, onConflict: "replace" | "copy") => {
    setImporting(true);
    try {
      const response = await fetch(`/api/package/import?requestedId=${encodeURIComponent(requestedId)}&onConflict=${onConflict}`, {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: file,
      });
      if (!response.ok) throw new Error(await response.text() || t("toolbar.importFailed"));
      const result = (await response.json()) as { ok: boolean; courseId: string };
      setPendingImport(null);
      actions.openCourse(result.courseId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t("toolbar.importFailed"));
    } finally {
      setImporting(false);
    }
  };

  const handleResolveConflict = (action: "replace" | "copy") => {
    if (!pendingImport) return;
    void uploadCoursePackage(pendingImport.file, pendingImport.courseId, action);
  };

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
      }
    };
    const handleDrop = (e: DragEvent) => {
      const file = e.dataTransfer?.files?.[0];
      if (file && file.name.toLowerCase().endsWith(".zip")) {
        e.preventDefault();
        void handleImportFile(file);
      }
    };
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [handleImportFile]);

  const exportCourse = async () => {
    if (exporting || state.working || !state.course.hasContent) return;
    setExporting(true);
    try {
      const endpoint = exportFormat === "package" ? "/api/package/export" : "/api/export";
      const response = exportFormat === "package"
        ? await fetch(endpoint)
        : await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: exportPrompt, language, agent: agentConfig }),
          });
      if (!response.ok) throw new Error(t("toolbar.exportFailed"));
      const disposition = response.headers.get("content-disposition") ?? "";
      const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
      const fallbackName = /filename="([^"]+)"/i.exec(disposition)?.[1] ?? (exportFormat === "package" ? `${state.courseId}.course.zip` : "course.html");
      const filename = encodedName ? decodeURIComponent(encodedName) : fallbackName;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportDialogOpen(false);
      setExportPrompt("");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t("toolbar.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  const statusText = useMemo(() => {
    if (!state.connected) return t("app.reconnecting");
    if (state.codex.state === "starting") return t("app.startingCodex");
    if (state.codex.state === "error") return t("app.codexAttention");
    return state.working ? t("app.agentWorking") : t("app.codexReady");
  }, [state.codex.state, state.connected, state.working, t]);

  const placeholder = selections.length
    ? t("app.askSelection")
    : state.course.phase === "syllabus"
      ? t("app.askSyllabus")
      : state.course.hasContent
      ? t("app.askLesson")
      : t("app.askTopic");

  const hasDesignHistory = state.items.some((item) => item.kind === "user")
    || state.conversations.some((conversation) => conversation.title !== "New conversation");

  if (!state.course.hasContent && !birthTopic && !hasDesignHistory && !state.switchingCourseId) {
    return (
      <Welcome
        connected={state.connected}
        hasCourse={false}
        working={state.working}
        courseId={state.courseId}
        courses={state.courses}
        switchingCourseId={state.switchingCourseId}
        models={state.models}
        agentConfig={agentConfig}
        onAgentConfigChange={setAgentConfig}
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
        switchingCourseId={state.switchingCourseId}
        models={state.models}
        agentConfig={agentConfig}
        onAgentConfigChange={setAgentConfig}
        onBack={returnToCourse}
        onSwitchCourse={switchCourse}
        onStart={startCourse}
      />
    );
  }

  const displayCourse = !state.course.hasContent && birthTopic
    ? { ...state.course, title: birthTopic, topic: t("app.courseOutline") }
    : !state.course.hasContent && state.conversationId
      ? {
          ...state.course,
          title: state.conversations.find((conversation) => conversation.id === state.conversationId)?.title
            ?? state.course.title,
          topic: t("app.courseInterview"),
        }
      : state.course;

  return (
    <div
      className={[
        "studio-shell",
        chatOpen ? "chat-is-open" : "chat-is-closed",
        courseNavOpen ? "course-nav-is-open" : "course-nav-is-closed",
        chatResizing ? "chat-is-resizing" : "",
      ].join(" ")}
      style={{
        "--chat-width": `${chatWidth}px`,
        "--course-nav-width": courseNavOpen ? "236px" : "52px",
      } as CSSProperties}
    >
      {Boolean(state.switchingCourseId) && (
        <div className="studio-top-progress-bar" role="progressbar" aria-label={t("toolbar.switchingCourse")} />
      )}
      <Toolbar
        courseTitle={switchingCourse?.title ?? displayCourse.title}
        courseId={state.courseId}
        courses={state.courses}
        inspecting={inspecting}
        multipleSelection={multipleSelection}
        canInspect={canInspect}
        courseChanged={state.courseChanged}
        checkpoints={state.checkpoints}
        working={state.working}
        switchingCourseId={state.switchingCourseId}
        exporting={exporting}
        importing={importing}
        onHome={() => setShowWelcome(true)}
        onSwitchCourse={switchCourse}
        onToggleInspect={toggleInspect}
        onToggleMultipleSelection={toggleMultipleSelection}
        onRevert={actions.revert}
        onExport={() => setExportDialogOpen(true)}
        onImportFile={handleImportFile}
      />

      <div className="studio-body" ref={studioBody}>
        <CourseNav
          course={displayCourse}
          activePage={visiblePage}
          activeSection={activeSection}
          working={state.working}
          collapsed={!courseNavOpen}
          onToggleCollapsed={() => setCourseNavOpen((open) => !open)}
          onSelectPage={onSelectPage}
          onSelectSection={onSelectSection}
          onChooseTopic={() => chat.current?.focusComposer()}
        />

        <main className="workspace">
          <Preview
            ref={preview}
            courseId={state.courseId}
            courseVersion={state.courseVersion}
            pagePath={visiblePage}
            initialScrollTop={
              resumeCourseId === state.courseId && resumePosition?.page === visiblePage
                ? resumePosition.top
                : 0
            }
            inspecting={inspecting}
            multipleSelection={multipleSelection}
            courseChanged={state.courseChanged}
            codex={state.codex}
            startingTopic={startingNewCourse ? birthTopic ?? undefined : undefined}
            switchingCourse={switchingCourse}
            working={state.working}
            onSelection={onSelection}
            onSelectionRemoved={onSelectionRemoved}
            onSelectionCleared={() => {
              if (!multipleSelection) setSelections([]);
            }}
            onReadingPosition={onReadingPosition}
            onInspectCancelled={stopInspecting}
            onStartRequested={() => chat.current?.focusComposer()}
          />
        </main>

        <div
          className="chat-resizer"
          role="separator"
          aria-label={t("app.resizeChat")}
          aria-orientation="vertical"
          aria-valuemin={MIN_CHAT_WIDTH}
          aria-valuemax={MAX_CHAT_WIDTH}
          aria-valuenow={Math.round(chatWidth)}
          tabIndex={chatOpen ? 0 : -1}
          title={t("app.resizeChatTitle")}
          onDoubleClick={() => updateChatWidth(DEFAULT_CHAT_WIDTH)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              updateChatWidth(chatWidth + (event.shiftKey ? 48 : 16));
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              updateChatWidth(chatWidth - (event.shiftKey ? 48 : 16));
            } else if (event.key === "Home") {
              event.preventDefault();
              updateChatWidth(MIN_CHAT_WIDTH);
            } else if (event.key === "End") {
              event.preventDefault();
              updateChatWidth(MAX_CHAT_WIDTH);
            }
          }}
          onPointerDown={(event) => {
            resizingPointer.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            setChatResizing(true);
          }}
          onPointerMove={(event) => {
            if (resizingPointer.current !== event.pointerId) return;
            const body = studioBody.current;
            if (body) updateChatWidth(body.getBoundingClientRect().right - event.clientX);
          }}
          onPointerUp={(event) => {
            if (resizingPointer.current !== event.pointerId) return;
            resizingPointer.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
            setChatResizing(false);
          }}
          onPointerCancel={() => {
            resizingPointer.current = null;
            setChatResizing(false);
          }}
        >
          <span />
        </div>

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
          models={state.models}
          agentConfig={agentConfig}
          onAgentConfigChange={setAgentConfig}
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
      <ExportDialog
        open={exportDialogOpen}
        format={exportFormat}
        prompt={exportPrompt}
        exporting={exporting}
        onFormatChange={setExportFormat}
        onPromptChange={setExportPrompt}
        onClose={() => setExportDialogOpen(false)}
        onExport={exportCourse}
      />
      <ImportConflictModal
        open={Boolean(pendingImport)}
        courseId={pendingImport?.courseId ?? ""}
        onResolve={handleResolveConflict}
        onClose={() => setPendingImport(null)}
      />
    </div>
  );
}
