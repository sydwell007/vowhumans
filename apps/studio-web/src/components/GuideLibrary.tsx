"use client";

import { CheckCircle2, Circle, PlayCircle } from "lucide-react";
import { useGuide } from "./GuideProvider";

export function GuideLibrary() {
  const { guidesForCurrentUser, progress, startGuide } = useGuide();

  return (
    <div className="content-stack guide-library">
      {guidesForCurrentUser.map((guide) => {
        const entry = progress[guide.id];
        const status = entry?.status ?? "not_started";
        const stepIndex = entry ? Math.max(0, guide.steps.findIndex((step) => step.id === entry.currentStepId)) : 0;
        const percent = status === "completed" ? 100 : entry ? Math.round((entry.completedStepIds.length / guide.steps.length) * 100) : 0;
        return (
          <article className="panel guide-library-card" key={guide.id}>
            <div className="guide-library-head">
              <span>{status === "completed" ? <CheckCircle2 size={20} /> : status === "in_progress" ? <PlayCircle size={20} /> : <Circle size={20} />}</span>
              <div>
                <h2>{guide.title}</h2>
                <p>{guide.description}</p>
              </div>
              <small>~{guide.estimatedMinutes} min · {guide.steps.length} steps</small>
            </div>
            <i className="guide-library-progress"><b style={{ width: `${percent}%` }} /></i>
            <button
              className="primary-button"
              type="button"
              onClick={() => startGuide(guide.id, status === "in_progress" ? stepIndex : 0)}
            >
              {status === "completed" ? "Restart guide" : status === "in_progress" ? "Resume guide" : "Start guide"}
            </button>
          </article>
        );
      })}
    </div>
  );
}
