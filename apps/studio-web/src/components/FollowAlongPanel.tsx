"use client";

import { useState } from "react";
import { Compass, MapPin, X } from "lucide-react";
import { useGuide } from "./GuideProvider";
import { CoachMark } from "./CoachMark";

// The docked strip is deliberately minimal — guide identity, progress and
// "Show me where" — so it never duplicates CoachMark's own title, body and
// Next/Back/Skip controls, which stay anchored to the real element the step
// is teaching (or float with a "Finding this on the page…" note when that
// element isn't mounted yet, e.g. the user hasn't navigated there).
export function FollowAlongPanel() {
  const { activeGuide, activeStepIndex, canAdvance, modalOpen, nextStep, previousStep, skipGuide, showMeWhere } = useGuide();
  const [manuallyCollapsed, setManuallyCollapsed] = useState(false);

  if (!activeGuide) return null;
  const step = activeGuide.steps[activeStepIndex];
  const collapsed = modalOpen || manuallyCollapsed;

  if (collapsed) {
    return (
      <button className="follow-along-tab" type="button" onClick={() => setManuallyCollapsed(false)} aria-label={`Resume guide: ${activeGuide.title}`}>
        <Compass size={17} />
        <span>{step.title}</span>
      </button>
    );
  }

  return (
    <>
      <aside className="follow-along-panel" aria-label="Follow Along guide">
        <div className="follow-along-head">
          <span className="follow-along-icon"><Compass size={16} /></span>
          <div>
            <small>{activeGuide.title}</small>
            <strong>Step {activeStepIndex + 1} of {activeGuide.steps.length} · {step.title}</strong>
          </div>
          <button className="icon-button" type="button" aria-label="Collapse guide" onClick={() => setManuallyCollapsed(true)}><X size={15} /></button>
        </div>
        <i className="follow-along-progress"><b style={{ width: `${Math.round((activeStepIndex / activeGuide.steps.length) * 100)}%` }} /></i>
        {step.target && (
          <button className="secondary-button follow-along-locate" type="button" onClick={showMeWhere}>
            <MapPin size={14} />Show me where
          </button>
        )}
        <div className="follow-along-actions">
          <button className="plain-button" type="button" onClick={skipGuide}>Skip guide</button>
        </div>
      </aside>
      <CoachMark
        selector={step.target?.selector ?? null}
        title={step.title}
        body={step.body}
        stepLabel={`Step ${activeStepIndex + 1} of ${activeGuide.steps.length}`}
        canAdvance={canAdvance}
        hasPrevious={activeStepIndex > 0}
        isLastStep={activeStepIndex + 1 >= activeGuide.steps.length}
        ownsScrim={modalOpen}
        onNext={nextStep}
        onPrevious={previousStep}
        onSkip={skipGuide}
      />
    </>
  );
}
