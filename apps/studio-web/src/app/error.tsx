"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { MarketingShell } from "@/components/MarketingShell";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <MarketingShell>
      <section className="commercial-page-hero operational-hero">
        <p className="commercial-kicker"><span />REQUEST INTERRUPTED</p>
        <h1>That request did not complete safely.</h1>
        <p>No provider action or transcript was affected. Retry the request or return to a known-good page.</p>
        <div className="page-cta-row"><button className="public-button" onClick={() => reset()}><RotateCcw size={15} /> Try again</button><Link className="public-button ghost" href="/">Return home</Link></div>
      </section>
    </MarketingShell>
  );
}
