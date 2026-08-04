export const personaStates = ["draft", "published", "archived", "revoked"] as const;
export type PersonaState = (typeof personaStates)[number];

export const digitalHumanStates = [
  "idle", "connecting", "listening", "thinking", "speaking", "encouraging",
  "explaining", "presenting", "interrupted", "closing", "completed", "error",
] as const;
export type DigitalHumanState = (typeof digitalHumanStates)[number];

export type GestureState = {
  blinkRangeMs: readonly [number, number];
  headMovementDegrees: number;
  gazeTarget: "participant" | "content" | "neutral";
  gestureLikelihood: number;
  captionState: "off" | "partial" | "final";
};

export const defaultGestureStates: Record<DigitalHumanState, GestureState> = {
  idle: { blinkRangeMs: [4200, 7600], headMovementDegrees: 2, gazeTarget: "neutral", gestureLikelihood: .05, captionState: "off" },
  connecting: { blinkRangeMs: [4000, 7000], headMovementDegrees: 1, gazeTarget: "neutral", gestureLikelihood: 0, captionState: "off" },
  listening: { blinkRangeMs: [3600, 6500], headMovementDegrees: 3, gazeTarget: "participant", gestureLikelihood: .08, captionState: "partial" },
  thinking: { blinkRangeMs: [3200, 6000], headMovementDegrees: 2, gazeTarget: "neutral", gestureLikelihood: .03, captionState: "final" },
  speaking: { blinkRangeMs: [3800, 6800], headMovementDegrees: 4, gazeTarget: "participant", gestureLikelihood: .12, captionState: "partial" },
  encouraging: { blinkRangeMs: [3600, 6200], headMovementDegrees: 4, gazeTarget: "participant", gestureLikelihood: .18, captionState: "final" },
  explaining: { blinkRangeMs: [4000, 7000], headMovementDegrees: 4, gazeTarget: "content", gestureLikelihood: .14, captionState: "partial" },
  presenting: { blinkRangeMs: [4200, 7200], headMovementDegrees: 3, gazeTarget: "content", gestureLikelihood: .1, captionState: "final" },
  interrupted: { blinkRangeMs: [3000, 5200], headMovementDegrees: 1, gazeTarget: "participant", gestureLikelihood: 0, captionState: "final" },
  closing: { blinkRangeMs: [4000, 7000], headMovementDegrees: 3, gazeTarget: "participant", gestureLikelihood: .08, captionState: "final" },
  completed: { blinkRangeMs: [5000, 8000], headMovementDegrees: 1, gazeTarget: "neutral", gestureLikelihood: 0, captionState: "off" },
  error: { blinkRangeMs: [5000, 8000], headMovementDegrees: 0, gazeTarget: "neutral", gestureLikelihood: 0, captionState: "final" },
};

export interface PersonaVersion {
  id: string;
  personaId: string;
  organisationId: string;
  version: number;
  state: PersonaState;
  name: string;
  role: string;
  description: string;
  systemInstructions: string;
  conversationStyle: string;
  openingMessage: string;
  objectives: readonly string[];
  guardrails: readonly string[];
  capabilities: readonly string[];
  knowledgeBaseIds: readonly string[];
  voiceId?: string;
  faceAssetId?: string;
  gestureProfileId?: string;
  language: string;
  speakingRate: number;
  maximumResponseWords: number;
  applicationOverrides: Readonly<Record<string, unknown>>;
  publishedAt?: string;
}

export interface ProviderHealth {
  provider: string;
  healthy: boolean;
  latencyMs?: number;
  capabilities: readonly string[];
  detail?: string;
}

export interface HealthCheckedProvider {
  readonly name: string;
  health(): Promise<ProviderHealth>;
}

export interface RealtimeConversationProvider extends HealthCheckedProvider {
  createSession(input: { persona: PersonaVersion; context: Record<string, unknown> }): Promise<{ providerSessionId: string }>;
}

export interface SpeechToTextProvider extends HealthCheckedProvider {
  transcribe(audio: Uint8Array, language?: string): Promise<{ text: string; confidence?: number }>;
}

export interface TextToSpeechProvider extends HealthCheckedProvider {
  synthesize(text: string, voiceId: string): Promise<{ audio: Uint8Array; mimeType: string }>;
}

export interface AvatarProvider extends HealthCheckedProvider {
  render(input: { identityId: string; audio: Uint8Array; signal?: AbortSignal }): Promise<{ frameStreamUrl?: string; latencyMs: number }>;
}

export function canPublishIdentity(input: { owner: boolean; written: boolean; face: boolean; voice: boolean; commercial: boolean; roles: number; applications: number; geography: boolean; expiry: boolean; provenance: boolean; approved: boolean; revoked: boolean }): boolean {
  return !input.revoked && input.owner && input.written && input.face && input.voice && input.commercial && input.roles > 0 && input.applications > 0 && input.geography && input.expiry && input.provenance && input.approved;
}

export function assertMutable(state: PersonaState): void {
  if (state !== "draft") throw new Error(`Persona version in ${state} state is immutable`);
}

