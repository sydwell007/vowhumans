"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Minus, X, MapPin } from "lucide-react";

// The single floating guide window — spotlight ring + tooltip. This used to
// be paired with a second, separate docked panel showing the same step
// counter and its own Skip button; the two boxes stacked on screen with
// overlapping controls and no clear read on which one to use. Everything
// (guide identity, progress, "Show me where", Back/Skip/Next) now lives in
// this one element.
export type CoachMarkProps = {
  selector: string | null;
  guideTitle: string;
  title: string;
  body: string;
  stepIndex: number;
  stepCount: number;
  canAdvance: boolean;
  hasPrevious: boolean;
  isLastStep: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  onShowMeWhere: () => void;
  onMinimize: () => void;
};

type TargetRect = { top: number; left: number; width: number; height: number };

export function CoachMark({ selector, guideTitle, title, body, stepIndex, stepCount, canAdvance, hasPrevious, isLastStep, onNext, onPrevious, onSkip, onShowMeWhere, onMinimize }: CoachMarkProps) {
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
      // Escape minimizes rather than skips — a keyboard reflex to dismiss a
      // dialog shouldn't silently abandon guide progress; that stays a
      // deliberate click on the explicit Skip control.
      if (event.key === "Escape") { onMinimize(); return; }
      if ((event.key === "ArrowRight" || event.key === "Enter") && canAdvance) { onNext(); return; }
      if (event.key === "ArrowLeft" && hasPrevious) onPrevious();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canAdvance, hasPrevious, onNext, onPrevious, onMinimize]);

  if (typeof document === "undefined") return null;

  const flipAbove = rect ? rect.top + rect.height + 260 > window.innerHeight : false;
  const tooltipStyle = rect
    ? {
        top: flipAbove ? Math.max(16, rect.top - 280) : rect.top + rect.height + 14,
        left: Math.min(Math.max(rect.left, 16), Math.max(16, window.innerWidth - 356)),
      }
    : undefined;

  return createPortal(
    <>
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
        aria-label={`${guideTitle} — ${title}`}
      >
        <div className="coachmark-tooltip-head">
          <div>
            <p className="eyebrow">{guideTitle}</p>
            <small>Step {stepIndex + 1} of {stepCount}</small>
          </div>
          <div className="coachmark-tooltip-headbtns">
            <button className="icon-button" type="button" aria-label="Minimize guide" onClick={onMinimize}><Minus size={15} /></button>
            <button className="icon-button" type="button" aria-label="Skip guide" onClick={onSkip}><X size={15} /></button>
          </div>
        </div>
        <i className="coachmark-progress"><b style={{ width: `${Math.round((stepIndex / stepCount) * 100)}%` }} /></i>
        <h3>{title}</h3>
        <p>{body}</p>
        {!rect && <p className="coachmark-waiting">Finding this on the page…</p>}
        <div className="coachmark-actions">
          {selector && (
            <button className="plain-button" type="button" onClick={onShowMeWhere}>
              <MapPin size={13} />Show me where
            </button>
          )}
          {hasPrevious && (
            <button className="secondary-button" type="button" onClick={onPrevious}>
              <ArrowLeft size={14} />Back
            </button>
          )}
          <button className="primary-button" type="button" onClick={onNext} disabled={!canAdvance}>
            {isLastStep ? "Finish" : "Next"}<ArrowRight size={14} />
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
