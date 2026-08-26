"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, BriefcaseBusiness, Compass, GraduationCap, PlayCircle } from "lucide-react";
import { getGuide } from "@/lib/guides";
import { useGuide } from "./GuideProvider";
import { WalkthroughPlayer } from "./WalkthroughPlayer";

async function json<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path);
    const body = (await response.json().catch(() => null)) as { success?: boolean; data?: T } | null;
    return body?.success ? (body.data ?? null) : null;
  } catch {
    return null;
  }
}

export function StudioHomeChooser() {
  const { progress, startGuide, guidedMode } = useGuide();
  const [counts, setCounts] = useState<{ humans: number; colleagues: number } | null>(null);
  const [showWalkthrough, setShowWalkthrough] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      json<{ counts: { digital_humans: number } }>("/api/v1/dashboard"),
      json<{ colleagues: unknown[] }>("/api/v1/workforce"),
    ]).then(([dashboard, workforce]) => {
      if (!active) return;
      setCounts({ humans: dashboard?.counts.digital_humans ?? 0, colleagues: workforce?.colleagues.length ?? 0 });
    });
    return () => {
      active = false;
    };
  }, []);

  const inProgressEntry = Object.entries(progress).find(([, entry]) => entry.status === "in_progress");
  const inProgressGuide = inProgressEntry ? getGuide(inProgressEntry[0]) : null;
  const inProgressStepIndex = inProgressGuide && inProgressEntry
    ? Math.max(0, inProgressGuide.steps.findIndex((step) => step.id === inProgressEntry[1].currentStepId))
    : 0;

  if (!counts) return null;

  if (!guidedMode || (counts.humans > 0 && counts.colleagues > 0)) {
    return (
      <Link href="/studio/learn" className="studio-home-chooser-collapsed">
        <GraduationCap size={16} />
        <span>Guide Library — click-validated guides for every workflow</span>
        <ArrowRight size={15} />
      </Link>
    );
  }

  return (
    <section className="studio-home-chooser">
      <div className="studio-home-chooser-heading">
        <p className="eyebrow">What would you like to create?</p>
        <button type="button" className="studio-home-watch" onClick={() => setShowWalkthrough(true)}>
          <PlayCircle size={14} />Watch how it works
        </button>
      </div>
      <div className="studio-home-chooser-grid">
        <Link href="/studio/digital-humans" className="studio-home-chooser-card">
          <span><Bot size={22} /></span>
          <strong>Digital Human</strong>
          <p>A disclosed AI identity with a face, voice, knowledge and Persona — for interviews, tutoring, presenting or support.</p>
          <b>Start building <ArrowRight size={14} /></b>
        </Link>
        <Link href="/studio/workforce/create" className="studio-home-chooser-card">
          <span><BriefcaseBusiness size={22} /></span>
          <strong>Digital Colleague</strong>
          <p>A governed role with bounded work, approved tools, objectives and a named human owner.</p>
          <b>Start building <ArrowRight size={14} /></b>
        </Link>
      </div>
      {inProgressGuide && (
        <button type="button" className="studio-home-continue" onClick={() => startGuide(inProgressGuide.id, inProgressStepIndex)}>
          <Compass size={15} />Continue where I left off — {inProgressGuide.title}
        </button>
      )}
      {showWalkthrough && <WalkthroughPlayer onClose={() => setShowWalkthrough(false)} />}
    </section>
  );
}
