import type { Room } from "livekit-client";

export const LIVE_LANGUAGE_SWITCH_TOPIC = "vhm_language_switch_request";
export const LIVE_LANGUAGE_SWITCH_APPLIED_TOPIC = "vhm_language_switch_applied";
export const DIGITAL_HUMAN_LANGUAGE_CHANGED_EVENT = "studio:digital-human-language-changed";

export type LiveLanguageApplied = {
  languageCode: string;
  phase: "initial" | "switch";
};

export type DigitalHumanLanguageChangedDetail = {
  humanId: string;
  languageCode: string;
};

/**
 * Deliver a language change to the running realtime agent.
 *
 * LiveKit data-packet topics are transport metadata. Putting the same value only
 * inside the JSON body is not enough: the Python worker filters on
 * `DataPacket.topic` before it reads the body. Keep this small helper shared by
 * both Studio call surfaces so they cannot drift apart again.
 */
export async function publishLiveLanguageSwitch(room: Room, languageCode: string): Promise<void> {
  const payload = new TextEncoder().encode(JSON.stringify({
    type: LIVE_LANGUAGE_SWITCH_TOPIC,
    language_code: languageCode,
  }));

  await room.localParticipant.publishData(payload, {
    reliable: true,
    topic: LIVE_LANGUAGE_SWITCH_TOPIC,
  });
}
