"use client";

import { useEffect, useState } from "react";
import { Bot, BriefcaseBusiness } from "lucide-react";
import { computeDigitalColleagueSetupProgress, computeDigitalHumanSetupProgress, type SetupProgress } from "@/lib/guideEngine";

type Column = { label: string; name: string; progress: SetupProgress } | null;

async function json<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path);
    const body = (await response.json().catch(() => null)) as { success?: boolean; data?: T } | null;
    return body?.success ? (body.data ?? null) : null;
  } catch {
    return null;
  }
}

function ProgressColumn({ icon: Icon, column }: { icon: typeof Bot; column: Column }) {
  if (!column) return null;
  return (
    <div className="setup-progress-column">
      <div className="setup-progress-head">
        <span><Icon size={16} /></span>
        <div><small>{column.label}</small><strong>{column.name}</strong></div>
        <b>{column.progress.score}%</b>
      </div>
      <i className="setup-progress-bar"><b style={{ width: `${column.progress.score}%` }} /></i>
      <ul>
        {column.progress.checks.map((check) => (
          <li key={check.label} className={check.ready ? "done" : ""}>{check.label}</li>
        ))}
      </ul>
    </div>
  );
}

export function MySetupProgress() {
  const [humanColumn, setHumanColumn] = useState<Column>(null);
  const [colleagueColumn, setColleagueColumn] = useState<Column>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const dashboard = await json<{ humans: { id: string; name: string }[] }>("/api/v1/dashboard");
      const recentHuman = dashboard?.humans?.[0];
      if (recentHuman) {
        const [profile, links] = await Promise.all([
          json<{ human: { name: string; role: string; disclosure: string }; face: unknown; voice: unknown; knowledge_bases: unknown[]; persona: { state: string } | null; gesture_profile: unknown }>(`/api/v1/digital-humans/${recentHuman.id}`),
          json<{ items: { digital_human_id: string; enabled: boolean }[] }>("/api/v1/digital-human-applications"),
        ]);
        if (active && profile) {
          const enabledCount = (links?.items ?? []).filter((l) => l.digital_human_id === recentHuman.id && l.enabled).length;
          setHumanColumn({
            label: "Digital Human",
            name: profile.human.name,
            progress: computeDigitalHumanSetupProgress({
              identity: profile.human,
              hasFace: Boolean(profile.face),
              hasVoice: Boolean(profile.voice),
              knowledgeCount: profile.knowledge_bases.length,
              personaState: profile.persona?.state ?? null,
              hasGestureProfile: Boolean(profile.gesture_profile),
              enabledApplicationCount: enabledCount,
            }),
          });
        }
      }

      const workforce = await json<{ colleagues: { id: string; name: string }[]; tasks: { digital_colleague_id: string }[] }>("/api/v1/workforce");
      const recentColleague = workforce?.colleagues?.[0];
      if (recentColleague) {
        const detail = await json<{ readiness: { checks: { code: string; label: string; passed: boolean }[] }; deployments: unknown[] }>(`/api/v1/workforce/colleagues/${recentColleague.id}`);
        if (active && detail) {
          setColleagueColumn({
            label: "Digital Colleague",
            name: recentColleague.name,
            progress: computeDigitalColleagueSetupProgress({
              readinessChecks: detail.readiness.checks,
              isDeployed: detail.deployments.length > 0,
              hasWorkItems: (workforce?.tasks ?? []).some((task) => task.digital_colleague_id === recentColleague.id),
            }),
          });
        }
      }
      if (active) setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!loaded || (!humanColumn && !colleagueColumn)) return null;

  return (
    <section className="panel setup-progress-panel">
      <p className="eyebrow">My Setup Progress</p>
      <div className="setup-progress-grid">
        <ProgressColumn icon={Bot} column={humanColumn} />
        <ProgressColumn icon={BriefcaseBusiness} column={colleagueColumn} />
      </div>
    </section>
  );
}
