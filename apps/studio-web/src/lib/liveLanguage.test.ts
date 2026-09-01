import { describe, expect, it, vi } from "vitest";
import type { Room } from "livekit-client";
import { LIVE_LANGUAGE_SWITCH_TOPIC, publishLiveLanguageSwitch } from "./liveLanguage";

describe("publishLiveLanguageSwitch", () => {
  it("publishes a reliable packet with the topic the realtime worker consumes", async () => {
    const publishData = vi.fn().mockResolvedValue(undefined);
    const room = { localParticipant: { publishData } } as unknown as Room;

    await publishLiveLanguageSwitch(room, "zu-ZA");

    expect(publishData).toHaveBeenCalledOnce();
    const [encoded, options] = publishData.mock.calls[0];
    expect(JSON.parse(new TextDecoder().decode(encoded))).toEqual({
      type: LIVE_LANGUAGE_SWITCH_TOPIC,
      language_code: "zu-ZA",
    });
    expect(options).toEqual({ reliable: true, topic: LIVE_LANGUAGE_SWITCH_TOPIC });
  });

  it("does not report completion before LiveKit accepts the packet", async () => {
    const failure = new Error("data channel unavailable");
    const room = {
      localParticipant: { publishData: vi.fn().mockRejectedValue(failure) },
    } as unknown as Room;

    await expect(publishLiveLanguageSwitch(room, "xh-ZA")).rejects.toBe(failure);
  });
});
