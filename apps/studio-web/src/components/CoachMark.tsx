"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

export type CoachMarkProps = {
  selector: string | null;
  title: string;
  body: string;
  stepLabel: string;
  canAdvance: boolean;
  hasPrevious: boolean;
  isLastStep: boolean;
  // True while another dialog (the Digital Human wizard, a right-docked test
  // drawer) already owns a full-page scrim — CoachMark then skips its own so
  // the two dims never stack.
  ownsScrim: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
};

type TargetRect = { top: number; left: number; width: number; height: number };

export function CoachMark({ selector, title, body, stepLabel, canAdvance, hasPrevious, isLastStep, ownsScrim, onNext, onPrevious, onSkip }: CoachMarkProps) {
  const [rect, setRect] = useState<TargetRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const wasFoundRef = useRef(false);

  useEffect(() => {
    wasFoundRef.current = false;
    function measure() {
      const el = selector ? document.querySelector<HTMLElement>(`[data-guide="${selector}"]`) : null;
      if (!el) {
        wasFoundRef.current = false;
        setRect(null);
        return;
      }
      const box = el.getBoundingClientRect();
      setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
      if (!wasFoundRef.current) {
        wasFoundRef.current = true;
        tooltipRef.current?.focus({ preventScroll: true });
      }
    }
    measure();
    const interval = window.setInterval(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [selector]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { onSkip(); return; }
      if ((event.key === "ArrowRight" || event.key === "Enter") && canAdvance) { onNext(); return; }
      if (event.key === "ArrowLeft" && hasPrevious) onPrevious();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canAdvance, hasPrevious, onNext, onPrevious, onSkip]);

  if (typeof document === "undefined") return null;

  const flipAbove = rect ? rect.top + rect.height + 190 > window.innerHeight : false;
  const tooltipStyle = rect
    ? {
        top: flipAbove ? Math.max(16, rect.top - 210) : rect.top + rect.height + 14,
        left: Math.min(Math.max(rect.left, 16), Math.max(16, window.innerWidth - 356)),
      }
    : undefined;

  return createPortal(
    <>
      {!ownsScrim && <div className="coachmark-scrim" onClick={onSkip} aria-hidden="true" />}
      {rect && (
        <div className="coachmark-ring" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} aria-hidden="true" />
      )}
      <div
        ref={tooltipRef}
        tabIndex={-1}
        className={`coachmark-tooltip${rect ? "" : " coachmark-tooltip-floating"}`}
        style={tooltipStyle}
        role="dialog"
        aria-live="polite"
        aria-label={title}
      >
        <button className="icon-button coachmark-close" type="button" aria-label="Skip guide" onClick={onSkip}><X size={15} /></button>
        <p className="eyebrow">{stepLabel}</p>
        <h3>{title}</h3>
        <p>{body}</p>
        {!rect && <p className="coachmark-waiting">Finding this on the page…</p>}
        <div className="coachmark-actions">
          {hasPrevious && (
            <button className="secondary-button" type="button" onClick={onPrevious}>
              <ArrowLeft size={14} />Back
            </button>
          )}
          <button className="plain-button" type="button" onClick={onSkip}>Skip guide</button>
          <button className="primary-button" type="button" onClick={onNext} disabled={!canAdvance}>
            {isLastStep ? "Finish" : "Next"}<ArrowRight size={14} />
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
