"use client";

import { useEffect, useRef } from "react";
import { Room, RoomEvent, Track } from "livekit-client";

export type LiveVoiceRoomStatus = "connecting" | "connected" | "error" | "disconnected";

export function LiveVoiceRoom({ url, token, muted, onStatusChange }: { url: string; token: string; muted: boolean; onStatusChange?: (status: LiveVoiceRoomStatus) => void }) {
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    let cancelled = false;
    const room = new Room();
    roomRef.current = room;
    const notify = (status: LiveVoiceRoomStatus) => {
      if (!cancelled) onStatusChangeRef.current?.(status);
    };

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) {
        const element = track.attach();
        element.autoplay = true;
        audioContainerRef.current?.appendChild(element);
      }
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((element) => element.remove());
    });
    room.on(RoomEvent.Disconnected, () => notify("disconnected"));

    notify("connecting");
    room
      .connect(url, token)
      .then(() => room.localParticipant.setMicrophoneEnabled(!muted))
      .then(() => notify("connected"))
      .catch(() => notify("error"));

    return () => {
      cancelled = true;
      room.disconnect();
      roomRef.current = null;
    };
    // Reconnect only when the room identity (url/token) changes; mute is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, token]);

  useEffect(() => {
    roomRef.current?.localParticipant.setMicrophoneEnabled(!muted).catch(() => {});
  }, [muted]);

  return <div ref={audioContainerRef} className="live-voice-audio" aria-hidden="true" />;
}
