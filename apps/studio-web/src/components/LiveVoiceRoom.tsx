"use client";

import { useEffect, useRef } from "react";
import { Room, RoomEvent, Track } from "livekit-client";

export type LiveVoiceRoomStatus = "connecting" | "connected" | "error" | "disconnected";

// Tracks published by the avatar-participant service (services/avatar-participant)
// under these fixed names — see services/api-gateway/main.py's RoomAgentDispatch and
// PROVIDERS.md's "avatar participant" design note. Identified by track name, not
// participant identity, since the voice agent's own dispatched identity isn't
// something this app controls or can rely on.
const AVATAR_TRACK_PREFIX = "vhm-avatar-";

export function LiveVoiceRoom({ url, token, muted, onStatusChange }: { url: string; token: string; muted: boolean; onStatusChange?: (status: LiveVoiceRoomStatus) => void }) {
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const onStatusChangeRef = useRef(onStatusChange);
  // Raw agent audio plays instantly for turn 1 (unchanged behavior). Once the
  // avatar participant signals readiness, every subsequent turn's audio comes
  // from its own re-muxed vhm-avatar-audio track instead — attaching both would
  // mean hearing every reply twice. This ref tracks which mode we're in and mutes
  // the raw track accordingly; it reverts if the avatar's tracks ever drop.
  const avatarModeRef = useRef(false);
  const rawAudioElRef = useRef<HTMLMediaElement | null>(null);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    let cancelled = false;
    const room = new Room();
    roomRef.current = room;
    avatarModeRef.current = false;
    rawAudioElRef.current = null;
    const notify = (status: LiveVoiceRoomStatus) => {
      if (!cancelled) onStatusChangeRef.current?.(status);
    };

    room.on(RoomEvent.TrackSubscribed, (track, publication) => {
      const isAvatarTrack = publication.trackName?.startsWith(AVATAR_TRACK_PREFIX) ?? false;

      if (track.kind === Track.Kind.Audio) {
        const element = track.attach() as HTMLMediaElement;
        element.autoplay = true;
        if (!isAvatarTrack) {
          // The raw voice-agent track: play unless we've already switched into
          // avatar mode (e.g. it re-subscribes after a reconnect mid-call).
          element.muted = avatarModeRef.current;
          rawAudioElRef.current = element;
        }
        audioContainerRef.current?.appendChild(element);
      } else if (track.kind === Track.Kind.Video && isAvatarTrack) {
        const element = track.attach() as HTMLVideoElement;
        element.autoplay = true;
        element.playsInline = true;
        videoContainerRef.current?.appendChild(element);
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, publication) => {
      track.detach().forEach((element) => element.remove());
      const isAvatarTrack = publication.trackName?.startsWith(AVATAR_TRACK_PREFIX) ?? false;
      if (isAvatarTrack && track.kind === Track.Kind.Audio) {
        // Avatar-participant dropped mid-call (crash, GPU pod down, etc.) — fall
        // back to the raw agent track so the conversation stays audible.
        avatarModeRef.current = false;
        if (rawAudioElRef.current) rawAudioElRef.current.muted = false;
      }
    });

    room.on(RoomEvent.DataReceived, (payload) => {
      try {
        const message = JSON.parse(new TextDecoder().decode(payload)) as { type?: string };
        if (message?.type === "vhm_avatar_ready") {
          avatarModeRef.current = true;
          if (rawAudioElRef.current) rawAudioElRef.current.muted = true;
        }
      } catch {
        // Not a message this component cares about.
      }
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

  return (
    <>
      <div ref={audioContainerRef} className="live-voice-audio" aria-hidden="true" />
      <div ref={videoContainerRef} className="live-voice-video" aria-hidden="true" />
    </>
  );
}
