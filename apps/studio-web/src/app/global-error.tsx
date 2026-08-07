"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-ZA">
      <body style={{ display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#071c25", color: "#fff", fontFamily: "sans-serif", padding: 24, textAlign: "center" }}>
        <div>
          <p style={{ letterSpacing: 2, fontSize: 12, color: "#ff754b", fontWeight: 700 }}>VOWHUMANS · CRITICAL ERROR</p>
          <h1 style={{ fontSize: 32, margin: "16px 0" }}>Something went wrong loading the app.</h1>
          <p style={{ color: "#9ab3b8", maxWidth: 460, margin: "0 auto 24px" }}>No provider action or transcript was affected. Reloading usually resolves this.</p>
          <button onClick={() => reset()} style={{ padding: "12px 28px", borderRadius: 8, border: 0, background: "#ff754b", color: "#102731", fontWeight: 700, cursor: "pointer" }}>Reload</button>
        </div>
      </body>
    </html>
  );
}
