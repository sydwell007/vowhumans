import sql from "@/lib/db";

// A Gesture Profile's state_config.features stores each range as free-text a
// Studio user can edit directly ("4–7s", "±3°") — see GESTURE_FEATURES in
// api/v1/[...route]/route.ts. This module resolves an assigned profile and
// parses those strings into the numeric parameters the rendering pipeline
// (avatar-worker's MuseTalkEngine) can actually apply.
//
// Four of the seven configured features are genuinely applied to rendered
// video today: head_tilt, head_nod and breathing_sway as a small continuous
// cv2.warpAffine sway on the whole frame (no facial structure needed at
// all), and — as of this pass — blinking, via a Haar-cascade eye detector
// (bundled inside opencv-python-headless, no new/conflicting dependency)
// run once against the prepared avatar's source photo. gaze_shift,
// micro_expressions and hand_gestures remain stored and shown in the UI,
// but are NOT applied by any renderer: gaze/micro-expressions would need a
// real eyelid/iris landmark mesh (not just an eye bounding box) and hand
// gestures need a full-body pose/render pipeline, not a headshot lip-sync
// model — see docs/AVATAR_GESTURE_APPLICATION.md for the full reasoning,
// including the avatar models evaluated and why none were swapped in
// wholesale this pass.

export type GestureOverlay = {
  headTiltEnabled: boolean;
  headTiltDegrees: number;
  headNodEnabled: boolean;
  headNodDegrees: number;
  breathingSwayEnabled: boolean;
  blinkingEnabled: boolean;
  blinkIntervalMinSeconds: number;
  blinkIntervalMaxSeconds: number;
};

export const NEUTRAL_GESTURE_OVERLAY: GestureOverlay = {
  headTiltEnabled: false,
  headTiltDegrees: 0,
  headNodEnabled: false,
  headNodDegrees: 0,
  breathingSwayEnabled: false,
  blinkingEnabled: false,
  blinkIntervalMinSeconds: 0,
  blinkIntervalMaxSeconds: 0,
};

const DEFAULT_TILT_DEGREES = 3;
const DEFAULT_NOD_DEGREES = 4;
// A range this large would look like the avatar is nodding off, not swaying
// naturally — cheap insurance against a mistyped or malicious profile value
// (e.g. "±300°") turning into a genuinely broken-looking render.
const MAX_DEGREES = 12;

const DEFAULT_BLINK_MIN_SECONDS = 4;
const DEFAULT_BLINK_MAX_SECONDS = 7;
// Real human blinks are rarely faster than ~1.5s apart even for a nervous
// habit, and there's no real harm in an edited value slower than 20s beyond
// looking a little unnatural — these bounds exist only to stop a mistyped
// or malicious value ("0–0.01s") from producing a strobing render.
const MIN_BLINK_SECONDS = 1.5;
const MAX_BLINK_SECONDS = 20;

function parseDegrees(range: string, fallback: number): number {
  const match = /(\d+(?:\.\d+)?)/.exec(range);
  if (!match) return fallback;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, MAX_DEGREES);
}

// Blinking's range is a two-value gap-between-blinks window ("4–7s"), unlike
// degrees' single value — a Studio user can edit either number independently
// (e.g. "2–9s"), a single value alone ("5s", meaning a fixed gap), or leave
// it unparseable/blank, in which case this falls back to the real Studio
// default rather than guessing.
function parseBlinkSeconds(range: string): [min: number, max: number] {
  const match = /(\d+(?:\.\d+)?)\s*(?:[–-]\s*(\d+(?:\.\d+)?))?/.exec(range);
  if (!match) return [DEFAULT_BLINK_MIN_SECONDS, DEFAULT_BLINK_MAX_SECONDS];
  const first = Number(match[1]);
  const second = match[2] !== undefined ? Number(match[2]) : first;
  if (!Number.isFinite(first) || !Number.isFinite(second) || first <= 0 || second <= 0) {
    return [DEFAULT_BLINK_MIN_SECONDS, DEFAULT_BLINK_MAX_SECONDS];
  }
  const min = Math.min(first, second);
  const max = Math.max(first, second);
  return [
    Math.min(Math.max(min, MIN_BLINK_SECONDS), MAX_BLINK_SECONDS),
    Math.min(Math.max(max, MIN_BLINK_SECONDS), MAX_BLINK_SECONDS),
  ];
}

type FeatureConfig = { enabled?: boolean; range?: string };
type GestureStateConfig = { features?: Record<string, FeatureConfig> };

// Pure — takes the already-fetched state_config so it's independently
// testable with hand-built fixtures, matching this repo's established
// "pure parsing/logic function, separate from its I/O-layer caller" pattern.
export function parseGestureOverlay(stateConfig: GestureStateConfig | null | undefined): GestureOverlay {
  const features = stateConfig?.features ?? {};
  const tilt = features.head_tilt;
  const nod = features.head_nod;
  const sway = features.breathing_sway;
  const blink = features.blinking;
  const tiltEnabled = Boolean(tilt?.enabled);
  const nodEnabled = Boolean(nod?.enabled);
  const blinkEnabled = Boolean(blink?.enabled);
  const [blinkMin, blinkMax] = blinkEnabled ? parseBlinkSeconds(blink?.range ?? "") : [0, 0];
  return {
    headTiltEnabled: tiltEnabled,
    // 0 whenever disabled — not just "unread by a caller that checks the
    // flag first" but unambiguously zero, so NEUTRAL_GESTURE_OVERLAY stays a
    // meaningful, directly-comparable "no effect" value on its own.
    headTiltDegrees: tiltEnabled ? parseDegrees(tilt?.range ?? "", DEFAULT_TILT_DEGREES) : 0,
    headNodEnabled: nodEnabled,
    headNodDegrees: nodEnabled ? parseDegrees(nod?.range ?? "", DEFAULT_NOD_DEGREES) : 0,
    breathingSwayEnabled: Boolean(sway?.enabled),
    blinkingEnabled: blinkEnabled,
    blinkIntervalMinSeconds: blinkMin,
    blinkIntervalMaxSeconds: blinkMax,
  };
}

// I/O layer: resolves the human's assigned gesture profile (if any) and
// parses it. Returns the neutral (all-disabled) overlay — never throws and
// never blocks a render — when nothing is assigned, matching how a missing
// face or voice already degrades to a safe fallback elsewhere in this app.
export async function resolveGestureOverlay(organisationId: string, humanSlug: string): Promise<GestureOverlay> {
  const [row] = await sql<{ state_config: GestureStateConfig | string }[]>`
    SELECT gp.state_config FROM human_gesture_assignments hga
    JOIN gesture_profiles gp ON gp.id = hga.gesture_profile_id
    WHERE hga.organisation_id = ${organisationId} AND hga.human_slug = ${humanSlug}
  `;
  if (!row) return NEUTRAL_GESTURE_OVERLAY;
  const stateConfig = typeof row.state_config === "string" ? (JSON.parse(row.state_config) as GestureStateConfig) : row.state_config;
  return parseGestureOverlay(stateConfig);
}
