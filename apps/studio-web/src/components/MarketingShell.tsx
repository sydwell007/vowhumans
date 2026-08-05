import Link from "next/link";
import { ArrowRight, ChevronDown, ShieldCheck } from "lucide-react";

const nav = [
  { label: "Platform", href: "/platform" },
  { label: "Products", href: "/products" },
  { label: "Solutions", href: "/solutions" },
  { label: "Industries", href: "/industries" },
  { label: "Digital Humans", href: "/digital-humans" },
  { label: "Templates", href: "/templates" },
  { label: "Integrations", href: "/integrations" },
  { label: "Developers", href: "/developers" },
  { label: "Pricing", href: "/pricing" },
];

export function MarketingShell({ children, tone = "light" }: { children: React.ReactNode; tone?: "light" | "dark" }) {
  return (
    <div className={`commercial-site commercial-${tone}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="public-header">
        <Link href="/" className="public-brand" aria-label="VowHumans home">
          <span className="public-brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><b>Vow</b>Humans<small>AI DIGITAL WORKFORCE</small></span>
        </Link>
        <nav className="public-nav" aria-label="Primary navigation">
          {nav.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
          <details className="resource-menu"><summary>Resources <ChevronDown size={13} /></summary><div><Link href="/customers">Customers</Link><Link href="/academy">Academy</Link><Link href="/security">Security</Link><Link href="/trust">Trust</Link><Link href="/resources">Resources</Link><Link href="/investors">Investors</Link></div></details>
        </nav>
        <div className="public-actions"><Link href="/sign-in" className="text-link">Sign in</Link><Link href="/studio" className="public-button compact">Open Studio <ArrowRight size={15} /></Link></div>
        <details className="mobile-public-menu"><summary aria-label="Open navigation"><span /><span /><span /></summary><nav>{nav.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}<Link href="/customers">Customers</Link><Link href="/academy">Academy</Link><Link href="/security">Security</Link><Link href="/trust">Trust</Link><Link href="/studio">Open Studio</Link></nav></details>
      </header>
      <main id="main-content">{children}</main>
      <footer className="public-footer">
        <div className="footer-lead"><Link href="/" className="public-brand"><span className="public-brand-mark" aria-hidden="true"><i /><i /><i /></span><span><b>Vow</b>Humans<small>AI DIGITAL WORKFORCE</small></span></Link><p>Secure, branded digital employees that talk, teach, sell, interview and support—honestly.</p><span><ShieldCheck size={15} /> AI disclosure and consent at the centre</span></div>
        <div><strong>Platform</strong><Link href="/products/studio">Studio</Link><Link href="/products/live">Live</Link><Link href="/products/present">Present</Link><Link href="/products/connect">Connect</Link><Link href="/marketplace">Marketplace</Link></div>
        <div><strong>Build</strong><Link href="/developers">Developers</Link><Link href="/api-reference">API reference</Link><Link href="/sdks">SDKs</Link><Link href="/templates">Templates</Link><Link href="/integrations">Integrations</Link></div>
        <div><strong>Company</strong><Link href="/about">About</Link><Link href="/customers">Customers</Link><Link href="/partners">Partners</Link><Link href="/investors">Investors</Link><Link href="/contact">Contact</Link></div>
        <div><strong>Trust</strong><Link href="/security">Security</Link><Link href="/trust">Trust Centre</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/terms">Terms</Link><Link href="/legal/responsible-ai">Responsible AI</Link></div>
        <div className="footer-bottom"><span>© 2026 VowHumans · A GoalVow platform</span><span>South Africa · Global-ready architecture</span><span>vowhumans.com DNS configuration pending</span></div>
      </footer>
    </div>
  );
}
