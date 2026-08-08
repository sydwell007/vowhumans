"use client";

import Image from "next/image";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-ZA">
      <body style={{ display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "radial-gradient(circle at 50% 16%, #101d49, #050816 45%)", color: "#f8fafc", fontFamily: "Segoe UI, sans-serif", padding: 24, textAlign: "center" }}>
        <div style={{ display: "grid", justifyItems: "center", maxWidth: 560 }}>
          <Image src="/brand/vowhumans-lockup.png" alt="VowHumans — AI Digital Workforce" width={220} height={153} priority style={{ width: 220, height: "auto", marginBottom: 12 }} />
          <p style={{ letterSpacing: 2, fontSize: 11, color: "#00d9ff", fontWeight: 800 }}>CRITICAL APPLICATION ERROR</p>
          <h1 style={{ fontSize: 36, margin: "12px 0", letterSpacing: "-0.04em" }}>Something interrupted the application.</h1>
          <p style={{ color: "#94a3b8", lineHeight: 1.7, margin: "0 auto 24px" }}>No provider action or transcript was affected. Reloading usually restores a safe session.</p>
          <button onClick={() => reset()} style={{ padding: "13px 28px", borderRadius: 11, border: "1px solid rgba(125,211,252,.34)", background: "linear-gradient(115deg,#00d9ff,#2563ff 38%,#7c3aed 72%,#d946ef)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>Reload application</button>
        </div>
      </body>
    </html>
  );
}
