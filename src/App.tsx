import { useCallback, useRef, useState } from "react";
import { Header } from "./components/Header.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Preview, type PreviewHandle } from "./components/Preview.tsx";
import { Chat } from "./components/Chat.tsx";
import { useStudio } from "./ws.ts";
import type { Selection } from "../shared/protocol.ts";

export function App() {
  const { state, actions } = useStudio();
  const [inspecting, setInspecting] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<Selection | null>(null);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const previewRef = useRef<PreviewHandle>(null);

  const canRevert = (state.course?.checkpoints.length ?? 0) > 1 && !state.turnActive;

  const onSelect = useCallback((sel: Selection) => {
    setPendingSelection(sel);
    setInspecting(false);
  }, []);

  const onInspectOff = useCallback(() => setInspecting(false), []);

  const onSend = (text: string) => {
    actions.sendChat(text, pendingSelection);
    setPendingSelection(null);
  };

  const onSelectSection = (id: string) => {
    setActiveSection(id);
    previewRef.current?.scrollTo(id);
  };

  return (
    <div className="studio">
      <Header
        course={state.course}
        inspecting={inspecting}
        canRevert={canRevert}
        canInspect={state.course?.hasContent ?? false}
        onToggleInspect={() => setInspecting((v) => !v)}
        onRevert={actions.revert}
      />
      <div className={`studio-body${chatCollapsed ? " chat-collapsed" : ""}`}>
        <Sidebar
          course={state.course}
          activeSection={activeSection}
          onSelectSection={onSelectSection}
        />
        <Preview
          ref={previewRef}
          hasCourse={state.course?.hasContent ?? false}
          reloadToken={state.reloadToken}
          inspecting={inspecting}
          onInspectOff={onInspectOff}
          onSelect={onSelect}
        />
        <Chat
          agent={state.agent}
          connected={state.connected}
          hasCourse={state.course?.hasContent ?? false}
          items={state.items}
          turnActive={state.turnActive}
          collapsed={chatCollapsed}
          pendingSelection={pendingSelection}
          onToggleCollapse={() => setChatCollapsed((v) => !v)}
          onClearSelection={() => setPendingSelection(null)}
          onSend={onSend}
        />
      </div>
    </div>
  );
}
