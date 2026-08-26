# Guided Studio — additional recommendations

Date: 2026-08-26

Recommendations beyond what shipped in this phase — deferred deliberately, not dropped. Each includes why it wasn't done now.

## 1. A granular `guide_events` log table

`guide_progress` (migration 020) is a per-user, per-guide snapshot: status, current step, completed steps, timestamps. It's enough for Phase 1 completion-rate and drop-off visibility (`WHERE status='in_progress' AND updated_at < now() - interval '7 days'` finds stalled guides; `completed_step_ids` array length over `steps.length` gives per-step drop-off). A richer event log (`guide_id, step_id, event_type, occurred_at`, one row per transition) would let a future analytics view answer "which single step do most people abandon on" rather than just "which guide." Deferred because it adds a second table and write path for a question nothing has asked yet — add it once real usage data shows the snapshot table's resolution is insufficient.

## 2. `NextBestAction` on entity detail pages

Currently `NextBestAction` only renders on Studio Home. A colleague detail page mid-builder, or a Digital Human profile page, could show a page-scoped next step (e.g. "3 blockers remain before this colleague can deploy" — the exact data `colleague.readiness.blockers` in `WorkforceStudio.tsx` already computes). Deferred because it needs its own placement audit per page (the plan's Studio Home insertion point was verified by direct read; detail-page insertion points were not), and Digital Colleague builder pages already show blockers inline on the approval step.

## 3. Additional Guide Library entries

Five guides shipped: the two flagship journeys plus Connect an application, Work Queue basics, Work Products basics. Real candidates for more, once these five have real usage:
- **Identity & Consent basics** — the four-record consent package (`ProductionIdentityConsent`) is real and currently undocumented in guide form.
- **Presenter Studio basics** — script → scene → render, a real but separate pipeline from both flagship guides.
- **Languages basics** — the honest per-capability status/testing tool (`languages`) is real but has no guided introduction.

Deferred to keep the initial guide count small and the content genuinely load-bearing rather than padding a library with guides nobody asked for.

## 4. A real analytics dashboard of guide completion

The data to build one already exists in `guide_progress` (status, timestamps) the moment guides start being used. No dashboard UI was built this pass — building one before there's any real data to show would be exactly the kind of "theatre" the rest of Studio explicitly avoids (see `AnalyticsWorkspace`'s "Recorded evidence only" framing, which this guide system deliberately reused rather than contradicted).

## 5. Live browser verification

`docs/GUIDED_NAVIGATION_VISUAL_QA.md` documents what this pass could and couldn't verify without a locally reachable, fully-migrated database. Running the manual click-through script there against a real seeded org, with real screenshots, is the most valuable next step before this reaches real users — everything else in this list is secondary to that.
