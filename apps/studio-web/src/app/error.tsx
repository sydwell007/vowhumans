"use client";

import Link from "next/link";
import { useEffect } from "react";
import { MarketingShell } from "@/components/MarketingShell";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <MarketingShell>
      <section className="commercial-page-hero">
        <p className="commercial-kicker"><span />SOMETHING WENT WRONG</p>
        <h1>That request didn’t complete safely.</h1>
        <p>No provider action or transcript was affected. You can retry, or return to a known-good page.</p>
        <div className="page-cta-row">
          <button className="public-button" onClick={() => reset()}>Try again</button>
          <Link className="public-button ghost" href="/">Return home</Link>
        </div>
      </section>
    </MarketingShell>
  );
}
