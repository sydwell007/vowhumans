"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getGuide, guides, guidesForRole, type Guide } from "@/lib/guides";
import { resolveGuideTarget, resolveResumableStepIndex } from "@/lib/guideEngine";
import { useAuth } from "./AuthContext";

export type GuideProgressStatus = "in_progress" | "completed" | "skipped" | "dismissed";
export type GuideProgressEntry = { status: GuideProgressStatus; currentStepId: string; completedStepIds: string[] };
type ProgressMap = Record<string, GuideProgressEntry>;

type GuideContextValue = {
  guides: Guide[];
  guidesForCurrentUser: Guide[];
  activeGuide: Guide | null;
  activeStepIndex: number;
  canAdvance: boolean;
  progress: ProgressMap;
  guidedMode: boolean;
  setGuidedMode: (value: boolean) => void;
  startGuide: (guideId: string, stepIndex?: number) => void;
  nextStep: () => void;
  previousStep: () => void;
  skipGuide: () => void;
  showMeWhere: () => void;
};

const GuideContext = createContext<GuideContextValue | null>(null);

function storageKey(userId: string) {
  return `vhm-guide-progress:${userId}`;
}

function readLocalProgress(userId: string): ProgressMap {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as ProgressMap) : {};
  } catch {
    return {};
  }
}

function writeLocalProgress(userId: string, progress: ProgressMap) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(progress));
  } catch {
    // Best-effort convenience cache — a full or unavailable localStorage never blocks a guide.
  }
}

export function GuideProvider({ children }: { children: React.ReactNode }) {
  const user = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [progress, setProgress] = useState<ProgressMap>(() => (typeof window === "undefined" ? {} : readLocalProgress(user.id)));
  const [guidedMode, setGuidedModeState] = useState(true);
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [eventSatisfied, setEventSatisfied] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/guide-progress").then((res) => res.json()).catch(() => null),
      fetch("/api/v1/guide-preferences").then((res) => res.json()).catch(() => null),
    ]).then(([progressBody, prefsBody]) => {
      hydratedRef.current = true;
      if (progressBody?.success) {
        const rows = (progressBody.data.items ?? []) as { guide_id: string; status: GuideProgressStatus; current_step_id: string; completed_step_ids: string[] }[];
        setProgress((current) => {
          const merged = { ...current };
          for (const row of rows) merged[row.guide_id] = { status: row.status, currentStepId: row.current_step_id, completedStepIds: row.completed_step_ids ?? [] };
          writeLocalProgress(user.id, merged);
          return merged;
        });
      }
      if (prefsBody?.success && typeof prefsBody.data?.guided_mode === "boolean") setGuidedModeState(prefsBody.data.guided_mode);
    });
  }, [user.id]);

  const activeGuide = activeGuideId ? getGuide(activeGuideId) ?? null : null;
  const activeStep = activeGuide?.steps[activeStepIndex] ?? null;

  const persist = useCallback(
    (guideId: string, entry: GuideProgressEntry) => {
      setProgress((current) => {
        const merged = { ...current, [guideId]: entry };
        writeLocalProgress(user.id, merged);
        return merged;
      });
      fetch(`/api/v1/guide-progress/${guideId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: entry.status, current_step_id: entry.currentStepId, completed_step_ids: entry.completedStepIds }),
      }).catch(() => {});
    },
    [user.id],
  );

  const startGuide = useCallback(
    (guideId: string, stepIndex = 0) => {
      const guide = getGuide(guideId);
      if (!guide) return;
      const resolvedIndex = resolveResumableStepIndex(guide.steps, stepIndex);
      setActiveGuideId(guideId);
      setActiveStepIndex(resolvedIndex);
      setEventSatisfied(false);
      const step = guide.steps[resolvedIndex];
      persist(guideId, { status: "in_progress", currentStepId: step.id, completedStepIds: progress[guideId]?.completedStepIds ?? [] });
    },
    [persist, progress],
  );

  const advanceOrFinish = useCallback(
    (fromIndex: number) => {
      if (!activeGuide) return;
      const finishedStep = activeGuide.steps[fromIndex];
      const completed = Array.from(new Set([...(progress[activeGuide.id]?.completedStepIds ?? []), finishedStep.id]));
      if (fromIndex + 1 >= activeGuide.steps.length) {
        persist(activeGuide.id, { status: "completed", currentStepId: finishedStep.id, completedStepIds: completed });
        setActiveGuideId(null);
        return;
      }
      const nextIndex = fromIndex + 1;
      setActiveStepIndex(nextIndex);
      setEventSatisfied(false);
      persist(activeGuide.id, { status: "in_progress", currentStepId: activeGuide.steps[nextIndex].id, completedStepIds: completed });
    },
    [activeGuide, persist, progress],
  );

  const nextStep = useCallback(() => advanceOrFinish(activeStepIndex), [advanceOrFinish, activeStepIndex]);

  const previousStep = useCallback(() => {
    if (!activeGuide || activeStepIndex === 0) return;
    setActiveStepIndex(activeStepIndex - 1);
    setEventSatisfied(false);
  }, [activeGuide, activeStepIndex]);

  const skipGuide = useCallback(() => {
    if (!activeGuide) return;
    persist(activeGuide.id, { status: "skipped", currentStepId: activeStep?.id ?? "", completedStepIds: progress[activeGuide.id]?.completedStepIds ?? [] });
    setActiveGuideId(null);
  }, [activeGuide, activeStep, persist, progress]);

  // Navigation-validated steps complete themselves the moment the real UI's own
  // action already changed the URL (the Digital Colleague builder is one page
  // per step) — no separate "Next" click needed once the page has moved on.
  useEffect(() => {
    function checkNavigationCompletion() {
      if (!activeStep || activeStep.validation.kind !== "navigation") return;
      if (activeStep.validation.test(pathname)) advanceOrFinish(activeStepIndex);
    }
    checkNavigationCompletion();
    // Only re-check when the guide's own step or the URL changes — advanceOrFinish is stable per step via activeStepIndex.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, activeStepIndex, activeStep]);

  // Every step's target.page is where the clickable element lives, never the
  // page a navigation-kind step's own validation is satisfied by (checked
  // across the whole catalogue) — so navigating there on activation can never
  // silently auto-complete a step, it only gets the user to where the real
  // action is. Without this, starting or resuming a guide from a different
  // page (the Guide Library, "Continue where I left off" on Studio Home) left
  // the coach mark stuck on "Finding this on the page…" forever, since
  // nothing ever took the user to the page the target is actually on.
  useEffect(() => {
    function navigateToStepTarget() {
      const target = activeStep?.target;
      if (!target?.page) return;
      const resolution = resolveGuideTarget(target, pathname);
      if (resolution.needsNavigation && resolution.page) router.push(resolution.page);
    }
    navigateToStepTarget();
    // Only re-run when the active step itself changes — not on every pathname
    // change, so a user who manually navigates elsewhere isn't yanked back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep]);

  useEffect(() => {
    function onStepComplete(event: Event) {
      const detail = (event as CustomEvent<{ step?: string }>).detail;
      if (activeStep?.validation.kind === "event" && detail?.step === activeStep.validation.step) setEventSatisfied(true);
    }
    window.addEventListener("studio:guide-step-complete", onStepComplete);
    return () => window.removeEventListener("studio:guide-step-complete", onStepComplete);
  }, [activeStep]);

  const setGuidedMode = useCallback(
    (value: boolean) => {
      setGuidedModeState(value);
      fetch("/api/v1/guide-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guided_mode: value }),
      }).catch(() => {});
    },
    [],
  );

  const showMeWhere = useCallback(() => {
    if (!activeStep?.target) return;
    const resolution = resolveGuideTarget(activeStep.target, pathname);
    if (resolution.needsNavigation && resolution.page) router.push(resolution.page);
  }, [activeStep, pathname, router]);

  const canAdvance = activeStep
    ? activeStep.validation.kind === "manual"
      ? true
      : activeStep.validation.kind === "navigation"
        ? activeStep.validation.test(pathname)
        : eventSatisfied
    : false;

  const guidesForCurrentUser = useMemo(() => guidesForRole(user.role), [user.role]);

  const value: GuideContextValue = {
    guides,
    guidesForCurrentUser,
    activeGuide,
    activeStepIndex,
    canAdvance,
    progress,
    guidedMode,
    setGuidedMode,
    startGuide,
    nextStep,
    previousStep,
    skipGuide,
    showMeWhere,
  };

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>;
}

export function useGuide(): GuideContextValue {
  const context = useContext(GuideContext);
  if (!context) throw new Error("useGuide() must be used within a GuideProvider");
  return context;
}
