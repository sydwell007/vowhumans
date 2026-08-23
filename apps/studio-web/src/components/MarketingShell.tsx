import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { MarketingNavigation } from "./MarketingNavigation";

export function MarketingShell({ children, tone = "light" }: { children: React.ReactNode; tone?: "light" | "dark" }) {
  return (
    <div className={`commercial-site commercial-${tone}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <MarketingNavigation />
      <main id="main-content">{children}</main>
      <footer className="public-footer">
        <div className="footer-lead">
          <Link href="/" className="public-brand" aria-label="VowHumans home"><BrandLogo variant="lockup" /></Link>
          <p>Secure, branded Digital Colleagues that talk, teach, sell, interview and support—honestly.</p>
          <span><ShieldCheck size={15} /> AI disclosure and consent at the centre</span>
        </div>
        <div><strong>Platform</strong><Link href="/workforce">Digital Workforce</Link><Link href="/workforce/roles">Roles</Link><Link href="/products/studio">Studio</Link><Link href="/products/live">Live</Link><Link href="/products/present">Present</Link></div>
        <div><strong>Build</strong><Link href="/developers">Developers</Link><Link href="/api-reference">API reference</Link><Link href="/sdks">SDKs</Link><Link href="/templates">Templates</Link><Link href="/integrations">Integrations</Link></div>
        <div><strong>Company</strong><Link href="/about">About</Link><Link href="/customers">Customers</Link><Link href="/partners">Partners</Link><Link href="/investors">Investors</Link><Link href="/contact">Contact</Link></div>
        <div><strong>Trust</strong><Link href="/security">Security</Link><Link href="/trust">Trust Centre</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/terms">Terms</Link><Link href="/legal/responsible-ai">Responsible AI</Link></div>
        <div className="footer-bottom"><span>© 2026 VowHumans · A GoalVow platform</span><span>South Africa · Global-ready architecture</span><Link href="/status">System status</Link></div>
      </footer>
    </div>
  );
}
