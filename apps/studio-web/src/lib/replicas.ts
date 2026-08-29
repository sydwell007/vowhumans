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
