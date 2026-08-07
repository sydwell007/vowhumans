import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "VowHumans — AI Digital Workforce Platform";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px 90px", background: "#071c25", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 44 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 74, height: 74, borderRadius: 22, background: "#ff754b" }}>
            <div style={{ position: "relative", display: "flex", width: 50, height: 50 }}>
              <div style={{ position: "absolute", width: 11, height: 38, left: 9, top: 6, borderRadius: 999, background: "#102731", transform: "rotate(-28deg)" }} />
              <div style={{ position: "absolute", width: 11, height: 47, left: 19, top: 1, borderRadius: 999, background: "#102731", transform: "rotate(-28deg)" }} />
              <div style={{ position: "absolute", width: 11, height: 27, right: 3, top: 15, borderRadius: 999, background: "#102731", transform: "rotate(-28deg)" }} />
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>
            <span style={{ color: "#ff754b" }}>Vow</span>
            <span>Humans</span>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 58, fontWeight: 600, lineHeight: 1.15, maxWidth: 980 }}>
          A disclosed AI digital workforce, built responsibly.
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 26, color: "#9ab3b8", maxWidth: 880 }}>
          Digital employees that talk, teach, sell, interview and support — with AI disclosure and consent at the centre.
        </div>
      </div>
    ),
    { ...size }
  );
}
