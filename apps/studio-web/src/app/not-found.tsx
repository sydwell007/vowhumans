import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";

export default function NotFound() {
  return <MarketingShell><section className="commercial-page-hero"><p className="commercial-kicker"><span />404 · ROUTE NOT FOUND</p><h1>This digital human stepped out.</h1><p>The page may have moved during the commercial platform expansion.</p><div className="page-cta-row"><Link className="public-button" href="/">Return home</Link><Link className="public-button ghost" href="/search">Search the site</Link></div></section></MarketingShell>;
}
