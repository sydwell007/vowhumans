import Link from "next/link";
import { Search } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";

export default function NotFound() {
  return (
    <MarketingShell>
      <section className="commercial-page-hero operational-hero">
        <p className="commercial-kicker"><span />404 · ROUTE NOT FOUND</p>
        <h1>This digital human stepped out.</h1>
        <p>The page may have moved as the platform evolved. Your account and Studio data are unaffected.</p>
        <div className="page-cta-row"><Link className="public-button" href="/">Return home</Link><Link className="public-button ghost" href="/search"><Search size={15} /> Search the site</Link></div>
      </section>
    </MarketingShell>
  );
}
