"use client";

import { useState } from "react";
import { Compass } from "lucide-react";
import { useGuide } from "./GuideProvider";
import { CoachMark } from "./CoachMark";

// A single floating guide window per active guide — CoachMark owns all of
// it (spotlight, title, progress, controls). This component only decides
// between that window and its minimized tab; it never renders a second box
// alongside CoachMark's own, which is what used to leave two overlapping
// pop-ups on screen with duplicate step counters and skip controls.
export function FollowAlongPanel() {
  const { activeGuide, activeStepIndex, canAdvance, nextStep, previousStep, skipGuide, showMeWhere } = useGuide();
  const [minimized, setMinimized] = useState(false);

  if (!activeGuide) return null;
  const step = activeGuide.steps[activeStepIndex];

  if (minimized) {
    return (
      <button className="follow-along-tab" type="button" onClick={() => setMinimized(false)} aria-label={`Resume guide: ${activeGuide.title}`}>
        <Compass size={17} />
        <span>{step.title}</span>
      </button>
    );
  }

  return (
    <CoachMark
      selector={step.target?.selector ?? null}
      guideTitle={activeGuide.title}
      title={step.title}
      body={step.body}
      stepIndex={activeStepIndex}
      stepCount={activeGuide.steps.length}
      canAdvance={canAdvance}
      hasPrevious={activeStepIndex > 0}
      isLastStep={activeStepIndex + 1 >= activeGuide.steps.length}
      onNext={nextStep}
      onPrevious={previousStep}
      onSkip={skipGuide}
      onShowMeWhere={showMeWhere}
      onMinimize={() => setMinimized(true)}
    />
  );
}
