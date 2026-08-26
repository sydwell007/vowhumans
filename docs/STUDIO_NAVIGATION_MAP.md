# Studio navigation map

Date: 2026-08-26

## Nav tree (unchanged groups, one new item)

```
Overview
  Dashboard                    ""
  Digital Workforce            workforce
  Guide Library                learn            <- new
Build
  Digital Humans, Personas, Knowledge, Voices, Faces, Gesture Profiles
Operate
  Test Centre, Operations, Work Queue, Work Products, Live Sessions,
  Presenter Studio, Languages, Applications
Govern
  Approvals, Identity & Consent, API Keys, Webhooks, Safety, Settings
Measure
  Workforce Analytics, Usage, Audit Logs
```

`Guide Library` is the only nav change: one entry appended to the existing Overview group (`apps/studio-web/src/data/platform.ts`), with a matching `pageMeta.learn` entry. No group was renamed, reordered or removed.

## The guide engine, in one paragraph

`apps/studio-web/src/lib/guides.ts` holds guide *content* (steps, copy, a `target.selector` naming a real `data-guide="..."` attribute, and a `validation` describing how completion is actually detected). `apps/studio-web/src/lib/guideEngine.ts` holds pure logic (setup-progress scoring, next-best-action, target resolution) with no DOM or fetch calls, unit-tested with hand-built fixtures. `GuideProvider` (`apps/studio-web/src/components/GuideProvider.tsx`) is the only stateful piece — it hydrates from `localStorage` for instant resume, reconciles against `guide_progress`/`studio_user_preferences` (migration 020) in the background, watches `usePathname()` for navigation-validated steps, and listens for a single `studio:guide-step-complete` CustomEvent for action-validated steps. `CoachMark` renders the spotlight ring and tooltip; `FollowAlongPanel` is the persistent dock (progress + "Show me where"); both live in `app/studio/layout.tsx`, which is the one truly persistent layout in the Studio tree (`StudioShell` remounts on every navigation, so it cannot hold this state).

## data-guide → real location → validation

### Digital Human flagship guide

| Guide step id | Real element | File | Validation |
| --- | --- | --- | --- |
| `dh-new` | "+ New" button, digital-humans list | `StudioView.tsx` | event (identity created) |
| `dh-wizard-step-identity` | Step 1 form | `StudioView.tsx` (`DigitalHumanWizard`) | event, dispatched in `submitIdentity()` |
| `dh-wizard-step-face` | Step 2 wrapper | `StudioView.tsx` | event, dispatched centrally in `advance()` |
| `dh-wizard-step-voice` | Step 3 wrapper | `StudioView.tsx` | event, via `advance()` |
| `dh-wizard-step-knowledge` | Step 4 wrapper | `StudioView.tsx` | event, via `advance()` |
| `dh-wizard-step-persona` | Step 5 wrapper | `StudioView.tsx` | event, via `advance()` |
| `dh-wizard-step-gesture` | Step 6 wrapper | `StudioView.tsx` | event, via `advance()` |
| `dh-wizard-step-applications` | Step 7 wrapper | `StudioView.tsx` | event, via `advance()` |
| `dh-wizard-activate` | Step 8 "Activate Digital Human" | `StudioView.tsx` (`finish()`) | event |
| `dh-post-deploy-test` | "Test Presence" card | `DigitalHumanDeploymentSuccess` | navigation to `/studio/test-centre` |
| `dh-post-deploy-colleague` | "Create a Digital Colleague" card | `DigitalHumanDeploymentSuccess` | navigation to `/studio/workforce/create` |

Every one of steps 2–7's completion is dispatched from the single `advance()` function (the shared `onDone` prop every step component calls), rather than instrumenting each of the six step components individually — `advance()` is the one place guaranteed to run regardless of which internal path (pick existing vs. generate new) a step's own UI used to finish.

### Digital Colleague flagship guide

| Guide step id | Real element | File | Validation |
| --- | --- | --- | --- |
| `wf-create` | "Create Digital Colleague" hero link | `WorkforceStudio.tsx` (`WorkforceDashboard`) | navigation to `/studio/workforce/create` |
| `wf-create-confirm` | "Create draft and configure" | `WorkforceStudio.tsx` (`CreateColleague`) | navigation to `/studio/workforce/:id/role` |
| `wf-builder-step-{role..collaboration,testing,approval}` (11 steps) | `ConfigurationStep` wrapper | `WorkforceStudio.tsx` (`ColleagueBuilder`) | navigation — each step's own URL is `/studio/workforce/:id/:step`, so moving to the next step's URL is real completion |
| `wf-builder-step-deployment` | "Deploy governed role" | `WorkforceStudio.tsx` (`ConfigurationStep`, `deploy()`) | event (no further URL step exists after deployment) |
| `wf-post-deploy-test` | "Run post-deployment tests" card | `WorkforceStudio.tsx` (deployment step's success section) | navigation to `/studio/test-centre` |
| `wf-test-run` | "Run test in Sandbox" | `WorkforceStudio.tsx` (`TestCentreWorkspace`, `run()`) | event |
| `wf-post-deploy-tasks` | "Assign sandbox work" card | `WorkforceStudio.tsx` | navigation to `/studio/tasks` |
| `wf-task-compose` | "Create work item" | `WorkforceStudio.tsx` (`TasksWorkspace`, `createTask()`) | event |
| `wf-task-brief` | "Prepare deterministic brief" | `WorkforceStudio.tsx` (`taskAction("review-brief")`) | event |
| `wf-product-approve` | "Approve" (work product review) | `WorkforceStudio.tsx` (`TasksWorkspace`, `review()`) | event |
| `wf-analytics` | Analytics workspace root | `WorkforceStudio.tsx` (`AnalyticsWorkspace`) | navigation to `/studio/workforce-analytics` |

The 12-step builder deliberately needed **zero** new dispatch code for 11 of its 12 steps — each step already has its own real URL (`ColleagueBuilder`'s pagination is `router.push` between `/studio/workforce/:id/:step`), so `GuideProvider` just watches `usePathname()`. Only `deployment` (the last step, which shows its success state on the same URL rather than moving to a new one) needed an explicit event dispatch. This was found by reading the builder's real pagination logic, not assumed from the spec.

### Focused guides

`connect-application` reuses `dh-wizard-step-applications` plus one new target, `app-connect` (the "Connect application" form on `/studio/applications`, `Applications()` in `StudioView.tsx`). `work-queue-basics` and `work-products-basics` reuse `wf-task-compose`, `wf-task-brief` and `wf-product-approve` — no new instrumentation.

## Coexistence with existing modals

The Digital Human wizard (`.drawer-scrim` / `.wizard-panel`) dispatches `studio:modal-open` on open and `studio:modal-close` on close (`openWizard()` / `closeWizard()` in `StudioView.tsx`) — matching the existing `studio:new-digital-human` event convention already used between `StudioShell` and `StudioView`. `GuideProvider` listens and collapses `FollowAlongPanel` to a slim tab while a modal is open, so the two never visually fight. `.test-drawer`'s CSS class exists in `globals.css` but is not currently used by any real component — there was nothing to instrument there.

## Z-index (unchanged values in bold, new values marked)

sidebar 40, topbar 25, search-results 60, sidebar-scrim 35 (mobile), **drawer-scrim / wizard-panel / test-drawer 80**, `.follow-along-panel` **82** (new), `.coachmark-scrim` **85** (new), `.coachmark-ring` / `.coachmark-tooltip` **90** (new), **toast 100**.
