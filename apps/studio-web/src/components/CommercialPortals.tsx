import Link from "next/link";
import { Activity, ArrowRight, BarChart3, Building2, KeyRound, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import { plans } from "@vowhumans/commercial-core";
import { adminSections, portalSections } from "@/data/commercial";
import { BrandLogo } from "./BrandLogo";
import { PortalAction } from "./CommercialInteractive";
import { MarketingShell } from "./MarketingShell";
import { EditorialVisual } from "./EditorialVisual";

const sectionTitle = (value: string) => value.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");

export function CustomerPortal({ section = "dashboard" }: { section?: string }) {
  const valid = portalSections.includes(section as typeof portalSections[number]) ? section : "dashboard";
  const cards = valid === "billing"
    ? plans.map((plan) => ({ title: plan.name, copy: plan.monthlyMinor === null ? "Contact sales" : `R${(plan.monthlyMinor / 100).toLocaleString("en-ZA")} / month` }))
    : valid === "integrations"
      ? [
          { title: "GoalVow ecosystem", copy: "Three contracts available; provider credentials remain server-side." },
          { title: "External SaaS", copy: "Planned connectors require OAuth review and provider accounts." },
          { title: "Generic REST", copy: "Available for scoped server-to-server use." },
        ]
      : [
          { title: "Current state", copy: "Sandbox preview; persistent organisation records require the configured production API." },
          { title: "Access boundary", copy: "Organisation context, workspace membership and role checks are required in production." },
          { title: "Next action", copy: `Configure or review ${sectionTitle(valid).toLowerCase()} without claiming an external provider is active.` },
        ];

  return (
    <MarketingShell>
      <section className="portal-frame">
        <aside className="portal-nav">
          <Link className="public-brand" href="/" aria-label="VowHumans home"><BrandLogo variant="lockup" /></Link>
          <nav aria-label="Customer portal navigation">{portalSections.map((item) => <Link className={item === valid ? "active" : ""} href={`/app/${item}`} key={item}>{sectionTitle(item)}</Link>)}</nav>
        </aside>
        <div className="portal-main">
          <header><div><p className="commercial-kicker"><span />AUTHENTICATED PRODUCT AREA</p><h1>{sectionTitle(valid)}</h1></div><Link className="public-button ghost dark-ghost" href="/studio">Open Studio</Link></header>
          <div className="portal-warning"><LockKeyhole size={18} /><p><b>Preview boundary:</b> production authentication, persistence, email and payments are not asserted. This UI is ready for the Afrihost API and chosen providers.</p></div>
          <section className="portal-metrics">
            <article><Users /><span><b>—</b><small>Verified members</small></span></article>
            <article><Activity /><span><b>Safe</b><small>Provider mode</small></span></article>
            <article><BarChart3 /><span><b>0</b><small>Billable live minutes</small></span></article>
            <article><ShieldCheck /><span><b>Required</b><small>MFA for privileged roles</small></span></article>
          </section>
          <section className="portal-content">
            <div className="content-card-grid">{cards.map((card) => <article className="content-card" key={card.title}><span className="commercial-status">CONFIGURATION</span><h2>{card.title}</h2><p>{card.copy}</p></article>)}</div>
            <div className="portal-empty"><Building2 size={28} /><h2>Build the first {sectionTitle(valid).toLowerCase()} record</h2><p>This creates a browser-local draft only. The production action is intentionally gated until authentication and persistence are connected.</p><PortalAction label={`Create ${sectionTitle(valid)} draft`} /></div>
          </section>
        </div>
      </section>
    </MarketingShell>
  );
}

export function AdminPortal({ section = "dashboard" }: { section?: string }) {
  const valid = adminSections.includes(section as typeof adminSections[number]) ? section : "dashboard";
  return (
    <section className="admin-frame">
      <aside>
        <Link href="/" className="public-brand" aria-label="VowHumans home"><BrandLogo variant="lockup" /></Link>
        <nav aria-label="Platform administration navigation">{adminSections.map((item) => <Link className={item === valid ? "active" : ""} href={`/admin/${item}`} key={item}>{sectionTitle(item)}</Link>)}</nav>
      </aside>
      <main>
        <header><div><p>RESTRICTED CONTROL PLANE</p><h1>{sectionTitle(valid)}</h1></div><span><KeyRound size={15} /> MFA + platform role required</span></header>
        <div className="admin-warning"><ShieldCheck size={18} /><p>This route is a non-production administrative preview. It contains no invented customer, revenue, payment, incident or provider data and must be protected before deployment use.</p></div>
        <section className="admin-grid">
          <article><small>RECORDS LOADED</small><strong>0</strong><p>No persistent administration source is connected.</p></article>
          <article><small>PROVIDER HEALTH</small><strong>Not asserted</strong><p>Health must come from signed server checks.</p></article>
          <article><small>AUDIT EXPORT</small><strong>Contract ready</strong><p>Immutable persistence requires database deployment.</p></article>
        </section>
        <section className="admin-table"><header><h2>{sectionTitle(valid)} register</h2><button disabled>Export unavailable</button></header><div><LockKeyhole size={24} /><p>Connect authenticated Afrihost API endpoints to load authorised records.</p></div></section>
      </main>
    </section>
  );
}

export function PartnerPortal({ path = [] }: { path?: string[] }) {
  const area = path[0] ?? "programme";
  return (
    <MarketingShell>
      <section className="commercial-page-hero has-editorial-visual">
        <div className="commercial-page-hero-copy">
          <p className="commercial-kicker"><span />PARTNER ECOSYSTEM</p>
          <h1>{area === "portal" ? "Partner portal foundation" : "Build services, integrations and capability with VowHumans."}</h1>
          <p>Technology, solution, referral, training and content partners share clear approval, entitlement and attribution boundaries.</p>
          <div className="page-cta-row"><Link className="public-button" href="/partner-apply">Apply to partner <ArrowRight size={15} /></Link><Link className="public-button ghost" href="/developers">Developer resources</Link></div>
        </div>
        <EditorialVisual variant="enterprise" priority />
      </section>
      <section className="commercial-page-body"><div className="content-card-grid">{["Technology partner", "Solution partner", "Referral partner", "Training partner", "Content partner", "Strategic partner"].map((title, index) => <article className="content-card" key={title}><span className="commercial-status">{index < 2 ? "LAUNCH PROGRAMME" : "APPLICATION REVIEW"}</span><h2>{title}</h2><p>Access scoped enablement, technical documentation and co-selling foundations after commercial, security and brand approval.</p></article>)}</div></section>
    </MarketingShell>
  );
}
