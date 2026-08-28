import sql from "@/lib/db";

// A Gesture Profile's state_config.features stores each range as free-text a
// Studio user can edit directly ("4–7s", "±3°") — see GESTURE_FEATURES in
// api/v1/[...route]/route.ts. This module resolves an assigned profile and
// parses those strings into the numeric parameters the rendering pipeline
// (avatar-worker's MuseTalkEngine) can actually apply.
//
// Only three of the seven configured features are genuinely applied to
// rendered video today: head_tilt, head_nod and breathing_sway, as a small
// continuous cv2.warpAffine sway on the whole frame — the one motion effect
// achievable without eye/body landmarks, which this face-bbox-only MuseTalk
// pipeline does not have. blinking, gaze_shift, micro_expressions and
// hand_gestures remain stored and shown in the UI, but are NOT applied by any
// renderer — implementing them honestly needs real eye/pose landmarks or a
// different avatar model, not something this module should fake. See
// docs/AVATAR_GESTURE_APPLICATION.md.

export type GestureOverlay = {
  headTiltEnabled: boolean;
  headTiltDegrees: number;
  headNodEnabled: boolean;
  headNodDegrees: number;
  breathingSwayEnabled: boolean;
};

export const NEUTRAL_GESTURE_OVERLAY: GestureOverlay = {
  headTiltEnabled: false,
  headTiltDegrees: 0,
  headNodEnabled: false,
  headNodDegrees: 0,
  breathingSwayEnabled: false,
};

const DEFAULT_TILT_DEGREES = 3;
const DEFAULT_NOD_DEGREES = 4;
// A range this large would look like the avatar is nodding off, not swaying
// naturally — cheap insurance against a mistyped or malicious profile value
// (e.g. "±300°") turning into a genuinely broken-looking render.
const MAX_DEGREES = 12;

function parseDegrees(range: string, fallback: number): number {
  const match = /(\d+(?:\.\d+)?)/.exec(range);
  if (!match) return fallback;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, MAX_DEGREES);
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
  const tiltEnabled = Boolean(tilt?.enabled);
  const nodEnabled = Boolean(nod?.enabled);
  return {
    headTiltEnabled: tiltEnabled,
    // 0 whenever disabled — not just "unread by a caller that checks the
    // flag first" but unambiguously zero, so NEUTRAL_GESTURE_OVERLAY stays a
    // meaningful, directly-comparable "no effect" value on its own.
    headTiltDegrees: tiltEnabled ? parseDegrees(tilt?.range ?? "", DEFAULT_TILT_DEGREES) : 0,
    headNodEnabled: nodEnabled,
    headNodDegrees: nodEnabled ? parseDegrees(nod?.range ?? "", DEFAULT_NOD_DEGREES) : 0,
    breathingSwayEnabled: Boolean(sway?.enabled),
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
