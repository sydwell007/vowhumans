import Link from "next/link";
import { RefreshCw, WifiOff } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <MarketingShell>
      <section className="commercial-page-hero operational-hero">
        <p className="commercial-kicker"><span />CONNECTION PAUSED</p>
        <WifiOff size={38} aria-hidden="true" />
        <h1>You appear to be offline.</h1>
        <p>Reconnect before continuing. No draft, provider action or transcript is being submitted from this page.</p>
        <div className="page-cta-row"><Link className="public-button" href="/"><RefreshCw size={15} /> Try the homepage</Link><Link className="public-button ghost" href="/support">Get support</Link></div>
      </section>
    </MarketingShell>
  );
}
