"use client";

import { useState } from "react";

export function Rigged3DRoom({ playerUrl }: { playerUrl: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="rigged-3d-room">
      {!loaded && <div className="embed-status embed-status-overlay">Starting the 3D stream&hellip;</div>}
      <iframe
        src={playerUrl}
        title="Fully rigged 3D digital human"
        allow="autoplay; fullscreen; microphone"
        sandbox="allow-forms allow-pointer-lock allow-same-origin allow-scripts"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
