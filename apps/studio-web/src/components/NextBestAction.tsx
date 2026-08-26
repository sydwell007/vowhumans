"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Compass } from "lucide-react";
import { nextBestAction, type NextBestAction as NextBestActionResult } from "@/lib/guideEngine";
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

// Both flagship guide ids open the automated walkthrough first — the earlier
// version sent people straight into an interactive coach-mark guide, which
// is a hands-on "do it now" tool, not an answer to "what does this even look
// like." Any other recommendation (review a Work Product, resolve a blocked
// identity, assign work) has no walkthrough script and just navigates.
const FLAGSHIP_GUIDE_IDS = new Set(["digital-human-flagship", "digital-colleague-flagship"]);

export function NextBestAction() {
  const router = useRouter();
  const [action, setAction] = useState<NextBestActionResult | null>(null);
  const [showWalkthrough, setShowWalkthrough] = useState(false);

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
          if (action.guideId && FLAGSHIP_GUIDE_IDS.has(action.guideId)) setShowWalkthrough(true);
          else router.push(action.href);
        }}
      >
        Go<ArrowRight size={15} />
      </button>
      {showWalkthrough && <WalkthroughPlayer onClose={() => setShowWalkthrough(false)} />}
    </section>
  );
}
