"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Compass, PlayCircle } from "lucide-react";
import { useGuide } from "./GuideProvider";
import { WalkthroughPlayer } from "./WalkthroughPlayer";

export function GuideLibrary() {
  const { guidesForCurrentUser, progress, startGuide } = useGuide();
  const [showWalkthrough, setShowWalkthrough] = useState(false);

  return (
    <div className="content-stack guide-library">
      <article className="panel guide-library-card guide-library-featured">
        <div className="guide-library-head">
          <span><Compass size={20} /></span>
          <div>
            <h2>Watch the full setup</h2>
            <p>An automated, pausable preview of the whole journey — a Digital Human, a Digital Colleague, deployed and put to work — using an illustrative example, not your real data.</p>
          </div>
          <small>~90 sec · 16 steps</small>
        </div>
        <button className="primary-button" type="button" onClick={() => setShowWalkthrough(true)}>
          Watch the walkthrough
        </button>
      </article>
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
      {showWalkthrough && <WalkthroughPlayer onClose={() => setShowWalkthrough(false)} />}
    </div>
  );
}
