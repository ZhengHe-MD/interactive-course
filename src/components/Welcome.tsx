import { ArrowLeft, ArrowRight, Shield } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import type { CourseSummary } from "../types";

type Props = {
  connected: boolean;
  hasCourse: boolean;
  working: boolean;
  courseId: string;
  courses: CourseSummary[];
  onBack: () => void;
  onSwitchCourse: (courseId: string) => void;
  onStart: (topic: string) => void;
};

const suggestions = ["Bayes' theorem", "Base rates & false positives", "Conditional probability"];

export function Welcome({ connected, hasCourse, working, courseId, courses, onBack, onSwitchCourse, onStart }: Props) {
  const [topic, setTopic] = useState("");
  const composer = useRef<HTMLTextAreaElement | null>(null);
  const canStart = connected && !working && topic.trim().length > 0;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (canStart) onStart(topic.trim());
  };

  const chooseSuggestion = (suggestion: string) => {
    setTopic(suggestion);
    window.setTimeout(() => composer.current?.focus(), 0);
  };

  return (
    <main className="welcome-screen">
      <header className="welcome-header">
        <div className="studio-wordmark">
          <span className="brand-mark"><Shield size={15} /></span>
          <span>Course Studio</span>
        </div>
        <div className="welcome-actions">
          {courses.length > 1 && (
            <label className="welcome-course-picker">
              <span>Open course</span>
              <select
                value={courseId}
                disabled={working}
                onChange={(event) => onSwitchCourse(event.target.value)}
              >
                {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
              </select>
            </label>
          )}
          {hasCourse && (
            <button className="welcome-back" type="button" onClick={onBack}>
              <ArrowLeft size={15} /> Back to your course
            </button>
          )}
        </div>
      </header>

      <section className="welcome-main">
        <div className="welcome-content">
          <span className="welcome-tag">A course built for one person — you</span>
          <h1>What do you want to finally understand?</h1>
          <p>
            Tell the design agent a topic. It writes the lesson from scratch — one section at a time — and
            you reshape it as you read, just by selecting the part that isn&apos;t landing.
          </p>

          <form className="welcome-composer" onSubmit={submit}>
            <textarea
              ref={composer}
              rows={1}
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="e.g. Bayes' theorem — I always get tripped up by false positives"
              aria-label="What do you want to understand?"
            />
            <button type="submit" disabled={!canStart}>
              Design it <ArrowRight size={16} />
            </button>
          </form>

          <div className="welcome-suggestions" aria-label="Suggested topics">
            <span>Try:</span>
            {suggestions.map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => chooseSuggestion(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>

          {!connected && <div className="welcome-connection">Connecting to the local course agent…</div>}
        </div>
      </section>

      <footer className="welcome-footer">Nothing is prewritten. Your course begins empty and is authored live.</footer>
    </main>
  );
}
