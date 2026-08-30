export const REPLICA_CAPTURE_STEPS = [
  "Identity & consent",
  "Camera",
  "Lighting",
  "Framing",
  "Speaking",
  "Listening",
  "Expressions",
  "Gestures",
  "Quality",
  "Processing",
  "Preview",
  "Approval",
] as const;

export const REPLICA_SEGMENT_TYPES = [
  "identity_reference",
  "idle",
  "listening",
  "speaking",
  "expression",
  "gesture",
  "calibration",
] as const;

export type ReplicaSegmentType = (typeof REPLICA_SEGMENT_TYPES)[number];
export type ReplicaGesture = "acknowledge" | "explain" | "emphasise" | "reassure";
export type ReplicaQualityMode = "standard" | "premium" | "presenter";
export type ReplicaVideoChapter = {
  type: ReplicaSegmentType;
  gesture?: ReplicaGesture;
  start_ms: number;
  end_ms: number;
};

export const MIN_REPLICA_CHAPTER_MS = 1_500;
export const MAX_REPLICA_CHAPTER_MS = 30_000;

export const REQUIRED_CAPTURE_SEGMENTS: ReadonlyArray<{
  type: ReplicaSegmentType;
  gesture?: ReplicaGesture;
  label: string;
  instruction: string;
}> = [
  { type: "idle", label: "Neutral idle", instruction: "Look naturally toward camera, breathe normally, and keep a neutral start and finish." },
  { type: "listening", label: "Listening", instruction: "Listen attentively with natural gaze shifts, blinking, breathing, and small acknowledgement motion." },
  { type: "speaking", label: "Speaking", instruction: "Speak the supplied calibration passage naturally while keeping shoulders and gaze relaxed." },
  { type: "gesture", gesture: "acknowledge", label: "Acknowledgement", instruction: "Start neutral, make one natural acknowledgement gesture, then return to neutral." },
  { type: "gesture", gesture: "explain", label: "Explanation gesture", instruction: "Start neutral, make one open-hand explanatory gesture, then return to neutral." },
] as const;

export function isReplicaSegmentType(value: unknown): value is ReplicaSegmentType {
  return typeof value === "string" && (REPLICA_SEGMENT_TYPES as readonly string[]).includes(value);
}

export function safeCaptureExtension(fileName: string, contentType: string): string {
  const extension = fileName.toLowerCase().match(/\.(webm|mp4|mov)$/)?.[1];
  if (extension) return extension;
  if (contentType === "video/mp4") return "mp4";
  if (contentType === "video/quicktime") return "mov";
  return "webm";
}

export function replicaCaptureReadiness(
  segments: ReadonlyArray<{ segment_type: string; gesture_key?: string | null; state: string; starts_neutral?: boolean; ends_neutral?: boolean }>,
) {
  const missing = REQUIRED_CAPTURE_SEGMENTS.filter((requirement) => !segments.some((segment) =>
    segment.state === "uploaded"
    && segment.segment_type === requirement.type
    && (!requirement.gesture || segment.gesture_key === requirement.gesture)
    && segment.starts_neutral === true
    && segment.ends_neutral === true,
  )).map((requirement) => requirement.label);
  return { ready: missing.length === 0, missing };
}

export function validateCompletePerformanceChapters(value: unknown, sourceDurationMs: number) {
  const errors: string[] = [];
  if (!Number.isSafeInteger(sourceDurationMs) || sourceDurationMs < MIN_REPLICA_CHAPTER_MS * REQUIRED_CAPTURE_SEGMENTS.length) {
    return { valid: false as const, chapters: [] as ReplicaVideoChapter[], errors: ["The source video must contain at least 7.5 seconds for five distinct performance chapters."] };
  }
  if (!Array.isArray(value)) {
    return { valid: false as const, chapters: [] as ReplicaVideoChapter[], errors: ["Five performance chapters are required."] };
  }

  const chapters: ReplicaVideoChapter[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push("Every performance chapter must be an object.");
      continue;
    }
    const chapter = raw as Record<string, unknown>;
    const type = chapter.type;
    const gesture = chapter.gesture;
    const startMs = Number(chapter.start_ms);
    const endMs = Number(chapter.end_ms);
    if (!isReplicaSegmentType(type) || !["idle", "listening", "speaking", "gesture"].includes(type)) {
      errors.push("A chapter has an unsupported performance type.");
      continue;
    }
    if (type === "gesture" && gesture !== "acknowledge" && gesture !== "explain") {
      errors.push("Gesture chapters must be acknowledgement or explanation.");
      continue;
    }
    if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || startMs < 0 || endMs > sourceDurationMs || endMs <= startMs) {
      errors.push("Every chapter needs a valid start and end within the source video.");
      continue;
    }
    const duration = endMs - startMs;
    if (duration < MIN_REPLICA_CHAPTER_MS || duration > MAX_REPLICA_CHAPTER_MS) {
      errors.push(`Every chapter must be between ${MIN_REPLICA_CHAPTER_MS / 1000} and ${MAX_REPLICA_CHAPTER_MS / 1000} seconds.`);
      continue;
    }
    chapters.push({ type, ...(type === "gesture" ? { gesture: gesture as ReplicaGesture } : {}), start_ms: startMs, end_ms: endMs });
  }

  for (const requirement of REQUIRED_CAPTURE_SEGMENTS) {
    const matches = chapters.filter((chapter) => chapter.type === requirement.type && (!requirement.gesture || chapter.gesture === requirement.gesture));
    if (matches.length !== 1) errors.push(`${requirement.label} must have exactly one chapter.`);
  }
  if (chapters.length !== REQUIRED_CAPTURE_SEGMENTS.length) errors.push("Exactly five required performance chapters must be supplied.");
  const ordered = [...chapters].sort((left, right) => left.start_ms - right.start_ms);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].start_ms < ordered[index - 1].end_ms) {
      errors.push("Performance chapters must not overlap.");
      break;
    }
  }

  return { valid: errors.length === 0, chapters, errors: [...new Set(errors)] };
}
