import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, display: "flex", alignItems: "center", justifyContent: "center", background: "#ff754b" }}>
        <div style={{ position: "relative", display: "flex", width: 124, height: 124 }}>
          <div style={{ position: "absolute", width: 28, height: 96, left: 22, top: 14, borderRadius: 999, background: "#102731", transform: "rotate(-28deg)" }} />
          <div style={{ position: "absolute", width: 28, height: 118, left: 48, top: 2, borderRadius: 999, background: "#102731", transform: "rotate(-28deg)" }} />
          <div style={{ position: "absolute", width: 28, height: 68, right: 8, top: 36, borderRadius: 999, background: "#102731", transform: "rotate(-28deg)" }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
