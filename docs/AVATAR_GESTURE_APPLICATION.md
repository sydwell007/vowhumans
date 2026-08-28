# Gesture Profile application — what's real, what isn't

Date: 2026-08-28 (blinking + model evaluation added same day, second pass)

## The bug this fixes

Gesture Profiles (`gesture_profiles`, `human_gesture_assignments` — migration `006_faces_gestures.sql`) were entirely write-only: a real Studio UI, a real database, a real 1:1 assignment to a Digital Human — but nothing in the rendering pipeline ever read that assignment. A configured "Head tilt ±3°" had zero effect on a live call, a Presenter Studio render, or an embedded application. `docs/STUDIO_FUNCTIONAL_AUDIT_2026-08-21.md`'s own coverage table only ever tested that a profile could be *created and assigned* — never that it did anything.

## What's genuinely fixed now

Four of the seven configured features now actually drive rendered avatar video, in both places that render one:

- Live calls (Studio test calls and embedded-application calls both go through `services/avatar-participant`)
- Presenter Studio scene renders (`api/v1/presenter-projects/:id/render-next-scene`)

Both call the same `avatar-worker` `/internal/v1/render` endpoint, so each fix lives in one place.

**Head tilt, head nod / shake, breathing / idle sway** — `services/avatar-worker/gesture_sway.py` applies a small, continuous, sine-driven `cv2.warpAffine` (rotation for tilt, vertical translation for nod/sway) to each already-blended frame, bounded by the human's configured degree range. Needs no facial structure at all.

**Blinking** (new this pass) — `services/avatar-worker/blink_synth.py`. Unlike the sway features, a believable blink needs to know roughly where the eyes are:

1. Once per prepared avatar (not per frame — an expensive, one-off cost, same shape as MuseTalk's own bbox/latent computation), `build_blink_material()` runs OpenCV's Haar cascade eye detector (`cv2.CascadeClassifier` + the `haarcascade_eye.xml` file bundled inside `opencv-python-headless` itself — no new dependency) against the avatar's source photo, restricted to search inside the already-known face bounding box.
2. If it confidently finds both eyes, it synthesizes a "closed eyes" variant of that same photo: for each eye's bounding rectangle, it samples the real skin tone immediately above the eye (the actual eyelid-closed colour for that specific photo, not a guessed average) and stretches it down over the eye opening, feathered so there's no visible seam.
3. At render time, `BlinkSchedule.build()` generates deterministic blink onset times spaced by the profile's configured "4–7s" gap (parsed by `apps/studio-web/src/lib/gesture.ts`'s new `parseBlinkSeconds`), and `apply_blink()` alpha-composites the closed-eyes frame over the live frame during each ~320ms blink window, eased in/out with a `sin²` curve so it never looks like a hard cut.
4. If the cascade can't confidently find both eyes in a given photo (steep angle, glasses glare, low light — not guaranteed for every source photo), blinking silently stays inactive for that one avatar. Never a crash, never a faked blink on a guessed position.

Data flow (extended, same shape as before): `apps/studio-web/src/lib/gesture.ts` resolves a human's assigned profile and now also parses `blinking`'s free-text interval ("4–7s") → the internal `api/internal/v1/gesture` endpoint serves the whole overlay to `avatar-participant` for live calls (the route itself needed no changes — it already forwards the full object) → the render-next-scene route resolves it directly for Presenter Studio → both pass `gesture_json` to `avatar-worker`'s `/internal/v1/render` → `GestureConfig.from_dict()` now carries the blink fields alongside the sway fields → `musetalk_engine.py`'s `render()` builds a `BlinkSchedule` once per reply and composites it into every frame, before the sway warp so the eye region moves together with a tilting/nodding head rather than lagging behind it.

## Why mediapipe (or another face-mesh library) wasn't used instead

`mediapipe` would give a genuinely more precise eyelid contour than a Haar cascade's bounding box. It wasn't used because it transitively depends on `opencv-contrib-python`, which installs its own build of the `cv2` native extension under the exact same import name as the `opencv-python-headless` build this service already depends on for MuseTalk's own face-parsing preprocessing. That's a real, documented pip conflict — whichever package installs last silently wins, and the loser's compiled features can vanish or misbehave depending on install order — and MuseTalk's own preprocessing pipeline (already working, already load-bearing for the entire product) was judged not worth destabilising over it. The Haar cascade route avoids the conflict entirely since it ships inside the already-installed `opencv-python-headless` build.

One real version gotcha this caught along the way: a throwaway venv with the *newest* `opencv-python-headless` (5.0.0) does **not** expose `cv2.CascadeClassifier` or a populated `cv2.data.haarcascades` directory the way the version this repo actually pins (`4.10.0.84`, in `services/avatar-worker/requirements.txt`) does. Verification below was run against the pinned version specifically, not "whatever's newest," after that discrepancy surfaced.

## What's still not applied, and why — not a shortcut, a real constraint

**Gaze shift, micro-expressions and hand gestures remain configured and assigned, but not reflected in rendered video.**

- **Gaze shift / micro-expressions** need a real iris/eyelid landmark mesh (not just an eye bounding box) to move convincingly — the same category of problem blinking solves for, but requiring sub-region precision a Haar cascade's rectangle doesn't give. This is the natural next increment on top of what blinking just built, if a genuine landmark model is later justified (see "Recommended next step" below).
- **Hand gestures** are a different problem entirely — MuseTalk's whole pipeline is a fixed-frame, face-crop lip-sync model. There is no body in the frame to begin with (the product's own live-call framing is a 480×720 headshot, not a body shot — see `apps/studio-web/src/app/globals.css`'s `.live-call-stage`), so hand gestures aren't a landmark problem to solve on the current pipeline at all; they need a fundamentally different rendering surface (full-body framing, a rigged/skeletal avatar or a body-pose-conditioned video model) — a separate product decision, not an incremental fix. See the model evaluation below for why this wasn't attempted as part of a wholesale model swap either.

Faking any of these with a cheap visual trick was deliberately not built — it would report a configured feature as "working" when it isn't, which this codebase's whole approach to capability truth (see `WorkforceStudio.tsx`'s "Capability truth" panel, `runtimeFeatureFlags()`, honest provider-health states) exists specifically to avoid.

## Avatar models evaluated for a wholesale replacement (not adopted this pass)

The ask was also to "explore best other avatar models entirely" for smoother, more human motion. Evaluated on paper (no GPU available in this environment to trial any of them):

| Model family | What it adds over MuseTalk | Why not swapped in now |
|---|---|---|
| **SadTalker** | Native head-pose + blink + eyebrow motion driven by audio, from one still photo | Older, lower visual fidelity than MuseTalk's lip-sync; would be a net *downgrade* in mouth accuracy to gain motion this pass's blink/sway work already covers a meaningful slice of |
| **LivePortrait** | Very high-quality driven head pose + expression, real-time capable | Needs a *driving video or expression signal* per reply, not just audio — would require a whole new expression-generation step this product doesn't have anywhere yet; different GPU memory/latency profile than the current warmed, single-model MuseTalk pod |
| **EMO / Hallo (diffusion talking-head)** | Highest quality — natural blink, gaze, micro-expression, even some upper-body sway, generated end-to-end from audio | Diffusion-based: substantially higher per-reply GPU latency and cost than MuseTalk's real-time-oriented pipeline; no established production-grade open weights as stable/licensable as MuseTalk's; would be a multi-week architecture project, not a fix |
| **Full 3D/rigged avatar** (e.g. a MetaHuman/Ready-Player-Me-style rigged model driven by blendshapes + gesture animation clips) | The only realistic path to genuine **hand gestures** — a different rendering paradigm entirely (skeletal animation, not video frame synthesis) | Entirely different content pipeline (a rigged 3D asset per digital human instead of a single photo), different rendering stack (a 3D engine, not MuseTalk), different call-framing (body shot, not headshot) — a new product surface, not a model swap |

None of these were adopted this pass. Swapping MuseTalk out is a materially larger, riskier project than this pass's scope (no GPU in this environment to validate any of them, real risk of regressing the one rendering path that's currently proven to work in production) — see "Recommended next step" for how to scope that properly if it's worth pursuing.

## Where this is now visible to a Studio user

The Gesture Profiles page (`StudioView.tsx`) shows an updated "Capability truth" banner explaining the split (now 4 of 7 genuinely applied, with blinking's photo-dependent caveat spelled out), and each of the 7 feature toggles in the create form is labelled **"Applied to rendered video"** or **"Recorded, not yet rendered"** — `GESTURE_FEATURE_DEFAULTS`'s `appliedToRender` field is the single source of truth for that label, matching `gesture_sway.py`/`blink_synth.py`'s actual behaviour exactly.

## Recommended next step, if gaze/micro-expressions or hand gestures matter enough to invest in

Two separate, independently-scopable projects, not one:

1. **Gaze/micro-expressions**: adopt a real landmark model deliberately (accepting and solving the `opencv-contrib-python` conflict head-on — e.g. isolating it in its own subprocess/microservice rather than the same Python process as MuseTalk's preprocessing) for a genuine eyelid/iris contour, building on the same one-off "prepare once per avatar" pattern this pass established for blinking.
2. **Hand gestures**: a genuine architecture change to a rigged 3D avatar pipeline for digital humans that need it — new asset pipeline, new rendering stack, new call-framing, GPU cost/latency re-budgeting, and its own quality bar before it would sit next to (not necessarily replace) the current MuseTalk headshot pipeline.

## Verification performed

- `apps/studio-web/src/lib/gesture.test.ts` — 19 tests (13 pre-existing + 6 new for blink range parsing): default range string ("4–7s"), disabled-toggle handling, a single-value fixed gap, a reversed min–max range, blank/unparseable input, and a clamp against an absurdly fast edited range.
- `services/avatar-worker/test_gesture_sway.py` — 10 tests (8 pre-existing + 2 new confirming `GestureConfig.from_dict` carries the blink fields and that `is_active` stays sway-only).
- `services/avatar-worker/test_blink_synth.py` (new) — 19 tests: `BlinkSchedule` determinism and configured-gap bounds, `blink_alpha`'s easing curve (zero outside the window, peaks near 1 at onset centre, symmetric), `detect_eye_boxes`/`build_blink_material`'s graceful-failure contract (blank frame, degenerate/out-of-bounds bbox — never crashes, never fabricates a detection), and `apply_blink`'s actual alpha-compositing math against hand-built synthetic materials (bypassing real eye detection, so this is deterministic regardless of whether a cascade fires on any given photo).
- All 29 avatar-worker Python tests run for real against a throwaway venv with `opencv-python-headless==4.10.0.84` (the exact version pinned in `requirements.txt`) and `numpy` installed, then the venv was deleted. Confirmed both files skip cleanly (not fail) in this repo's general Python test environment, which lacks those deps. Confirmed `npm run test:python`'s `unittest discover` doesn't reach either file (the pre-existing hyphenated-directory limitation, documented in both files' own header comments) — harmless, not a regression.
- `npm run check` (security:scan → route:check → lint → typecheck → test → test:python) passes clean; `apps/studio-web`'s `npm run build` passes clean.
- `services/avatar-worker/Dockerfile`'s `COPY` line was updated to include the new `blink_synth.py` file — checked deliberately after last pass's Dockerfile catch (`gesture_sway.py` was originally missing from the same COPY list before that was caught).
- **Not verified**: a real end-to-end blink/tilt/nod render was not watched. No GPU, no MuseTalk weights, and no real face photo were available in this environment to run `detect_eye_boxes` against an actual portrait — the detector call itself (does the Haar cascade actually find both eyes on a *typical Studio face photo*) is unverified here; what's verified for real is the surrounding contract (graceful failure on a bad/blank frame) and the compositing/scheduling math in isolation.

## Deployment status — this is the part most likely to explain "I pushed to Vercel but don't see any motion"

**Correction (second pass, same day)**: an earlier version of this document said `avatar-participant` deploys to Railway, per `docs/LIVE_VOICE_DEPLOYMENT.md`. That doc is real but scoped narrowly to `/demos/interview`'s voice-only path — it doesn't mention `avatar-participant` or `avatar-worker` at all. The repo's root `render.yaml` is the actual infra-as-code file Render reads directly from this GitHub repo, and it wires the real avatar pipeline: `vowhumans-api-gateway`, `vowhumans-realtime-agent`, and **`vowhumans-avatar-participant` all deploy to Render**, not Railway. `avatar-worker` is the one service genuinely on a different platform — a RunPod GPU pod (per `services/avatar-worker/PROVIDERS.md`).

This fix spans two separately-deployed halves of the system:

- **Next.js / Vercel** (Studio UI, the internal gesture-resolution API, Presenter Studio's render-next-scene wiring) and **`vowhumans-avatar-participant` / `vowhumans-realtime-agent` / `vowhumans-api-gateway` on Render**: both deploy from this same GitHub repo. Render's default behaviour for a GitHub-connected service is to auto-deploy on every push to the watched branch — if that's enabled on this account (not confirmed from inside this session), the `git push` already done for both gesture passes may have already redeployed `avatar-participant` with the code that fetches and forwards a digital human's gesture profile. That does **not**, on its own, make blinking/tilting appear — `avatar-participant` only forwards the gesture JSON; the actual `gesture_sway.py`/`blink_synth.py`/MuseTalk rendering code lives entirely in `avatar-worker`.
- **`avatar-worker`** (the actual MuseTalk + blink/sway rendering code) is a **RunPod GPU pod, and RunPod does not deploy from git at all** — it runs whatever Docker image tag the pod is currently pointed at. Per `services/avatar-worker/PROVIDERS.md`'s exact operator steps: build a new image from `services/avatar-worker/Dockerfile`, push it to whatever registry the pod pulls from, update the pod's image tag in the RunPod dashboard, expose TCP port 8000 as an HTTP service, and confirm `https://<pod-id>-8000.proxy.runpod.net/health` returns `model_loaded: true`. This session has no RunPod account credentials and no record of which image registry past deploys used, so it cannot perform this step — it is a manual, operator-run action regardless of anything pushed to git.

If Thandi's rendered call shows lip-sync but no head tilt/nod/breathing-sway/blink at all, the near-certain explanation is that `avatar-worker`'s RunPod pod is still running the pre-gesture image (it wouldn't have `gesture_sway.py` or `blink_synth.py` at all). That single manual RunPod redeploy is the one step blocking all of this — the original head-tilt/nod/sway work from the first pass and this pass's blinking alike — from becoming visible in a real call. This is not a new gap this pass introduced; it's the same gap flagged at the end of the previous pass, now traced to the correct platform.
