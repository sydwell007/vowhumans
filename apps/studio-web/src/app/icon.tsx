import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: 64, height: 64, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 20, background: "#ff754b" }}>
        <div style={{ position: "relative", display: "flex", width: 44, height: 44 }}>
          <div style={{ position: "absolute", width: 10, height: 34, left: 8, top: 5, borderRadius: 999, background: "#102731", transform: "rotate(-28deg)" }} />
          <div style={{ position: "absolute", width: 10, height: 42, left: 17, top: 1, borderRadius: 999, background: "#102731", transform: "rotate(-28deg)" }} />
          <div style={{ position: "absolute", width: 10, height: 24, right: 3, top: 13, borderRadius: 999, background: "#102731", transform: "rotate(-28deg)" }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
