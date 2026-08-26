"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Compass } from "lucide-react";
import { nextBestAction, type NextBestAction as NextBestActionResult } from "@/lib/guideEngine";
import { useGuide } from "./GuideProvider";

async function json<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path);
    const body = (await response.json().catch(() => null)) as { success?: boolean; data?: T } | null;
    return body?.success ? (body.data ?? null) : null;
  } catch {
    return null;
  }
}

export function NextBestAction() {
  const router = useRouter();
  const { startGuide } = useGuide();
  const [action, setAction] = useState<NextBestActionResult | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [dashboard, workforce] = await Promise.all([
        json<{ counts: { digital_humans: number; pending_identities: number } }>("/api/v1/dashboard"),
        json<{ colleagues: { status: string; open_work_count: number }[]; work_products: { status: string }[] }>("/api/v1/workforce"),
      ]);
      if (!active || !dashboard) return;
      const colleagues = workforce?.colleagues ?? [];
      const result = nextBestAction({
        digitalHumanCount: dashboard.counts.digital_humans,
        digitalColleagueCount: colleagues.length,
        blockedIdentityCount: dashboard.counts.pending_identities,
        deployedColleaguesWithNoWorkItems: colleagues.filter((item) => item.status === "deployed" && item.open_work_count === 0).length,
        workProductsAwaitingReview: (workforce?.work_products ?? []).filter((item) => item.status === "awaiting_review").length,
      });
      setAction(result);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!action) return null;

  return (
    <section className="panel next-best-action">
      <span className="empty-icon"><Compass size={20} /></span>
      <div>
        <p className="eyebrow">Next best action</p>
        <strong>{action.label}</strong>
      </div>
      <button
        className="primary-button"
        type="button"
        onClick={() => {
          router.push(action.href);
          if (action.guideId) startGuide(action.guideId);
        }}
      >
        Go<ArrowRight size={15} />
      </button>
    </section>
  );
}
