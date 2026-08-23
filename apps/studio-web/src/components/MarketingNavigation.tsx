"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "./BrandLogo";

type NavigationItem = { label: string; description: string; href: string };
type NavigationGroup = { label: string; eyebrow: string; items: NavigationItem[]; featured: NavigationItem };

const navigationGroups: NavigationGroup[] = [
  {
    label: "Platform",
    eyebrow: "Build, deploy and govern",
    featured: { label: "Explore the Digital Workforce", description: "One operating layer for disclosed identities, bounded roles and accountable work.", href: "/workforce" },
    items: [
      { label: "Digital Workforce", description: "Design roles, work, reviews and deployment.", href: "/workforce" },
      { label: "VowHumans Studio", description: "Configure the governed 12-step workflow.", href: "/products/studio" },
      { label: "Live", description: "Real-time voice and video experiences.", href: "/products/live" },
      { label: "Present", description: "Reusable presenter media and scenes.", href: "/products/present" },
    ],
  },
  {
    label: "Solutions",
    eyebrow: "Start with an operational outcome",
    featured: { label: "Browse all solutions", description: "Map roles, knowledge, channels and escalation before launch.", href: "/solutions" },
    items: [
      { label: "Customer experience", description: "Resolve routine requests and preserve human handoff.", href: "/industries/customer-service" },
      { label: "Recruitment & HR", description: "Prepare candidates and onboard teams responsibly.", href: "/industries/recruitment-hr" },
      { label: "Education", description: "Give learners a patient, source-grounded guide.", href: "/industries/education" },
      { label: "Sales enablement", description: "Guide product discovery without dark patterns.", href: "/industries/retail-ecommerce" },
    ],
  },
  {
    label: "Industries",
    eyebrow: "Designed for real boundaries",
    featured: { label: "Explore 13 industries", description: "Deployment patterns with clear security and integration needs.", href: "/industries" },
    items: [
      { label: "Financial services", description: "Product and process guidance, never unlicensed advice.", href: "/industries/financial-services" },
      { label: "Government", description: "Accessible navigation for public services.", href: "/industries/government" },
      { label: "Healthcare information", description: "Approved education and administration guidance.", href: "/industries/healthcare-information" },
      { label: "Manufacturing & mining", description: "Repeatable induction and procedure support.", href: "/industries/manufacturing-mining" },
    ],
  },
  {
    label: "Resources",
    eyebrow: "Evaluate with evidence",
    featured: { label: "Resource centre", description: "Guides, trust materials and responsible deployment resources.", href: "/resources" },
    items: [
      { label: "Digital Humans", description: "Browse disclosed fictional launch identities.", href: "/digital-humans" },
      { label: "Templates", description: "Start from reviewed roles and guardrails.", href: "/templates" },
      { label: "Developers", description: "Build with APIs, SDKs and webhooks.", href: "/developers" },
      { label: "Security & Trust", description: "Review active controls and roadmap status.", href: "/trust" },
    ],
  },
];

export function MarketingNavigation() {
  const pathname = usePathname();
  const navigationRef = useRef<HTMLElement>(null);
  const mobileNavigationRef = useRef<HTMLDivElement>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileOpen]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenGroup(null);
        setMobileOpen(false);
      }
    }
    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      const outsideHeader = navigationRef.current && !navigationRef.current.contains(target);
      const outsideMobileNavigation = !mobileNavigationRef.current || !mobileNavigationRef.current.contains(target);
      if (outsideHeader && outsideMobileNavigation) setOpenGroup(null);
    }
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, []);

  function closeMenus() {
    setOpenGroup(null);
    setMobileOpen(false);
  }

  return (
    <>
      <header className="public-header" ref={navigationRef}>
      <Link href="/" className="public-brand" aria-label="VowHumans home" onClick={closeMenus}><BrandLogo variant="lockup" priority /></Link>

      <nav className="public-nav" aria-label="Primary navigation">
        {navigationGroups.map((group) => {
          const isOpen = openGroup === group.label;
          return (
            <div className={`nav-group-menu ${isOpen ? "is-open" : ""}`} key={group.label}>
              <button type="button" aria-expanded={isOpen} aria-controls={`menu-${group.label.toLowerCase()}`} onClick={() => setOpenGroup(isOpen ? null : group.label)}>
                {group.label}<ChevronDown size={14} />
              </button>
              <div className="mega-menu" id={`menu-${group.label.toLowerCase()}`} hidden={!isOpen}>
                <Link className="mega-menu-feature" href={group.featured.href} onClick={closeMenus}>
                  <small>{group.eyebrow}</small><strong>{group.featured.label}</strong><span>{group.featured.description}</span><b>Explore <ArrowRight size={14} /></b>
                </Link>
                <div className="mega-menu-links">
                  {group.items.map((item) => <Link href={item.href} key={item.href} onClick={closeMenus}><strong>{item.label}</strong><span>{item.description}</span></Link>)}
                </div>
              </div>
            </div>
          );
        })}
        <Link className={pathname === "/pricing" ? "active" : ""} href="/pricing" onClick={closeMenus}>Pricing</Link>
      </nav>

      <div className="public-actions"><Link href="/sign-in" className="text-link" onClick={closeMenus}>Sign in</Link><Link href="/studio" className="public-button compact" onClick={closeMenus}>Open Studio <ArrowRight size={15} /></Link></div>

      <button type="button" className="mobile-menu-trigger" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} aria-controls="mobile-public-navigation" onClick={() => setMobileOpen((open) => !open)}>
        {mobileOpen ? <X size={22} /> : <Menu size={22} />}
      </button>
      </header>
      <div ref={mobileNavigationRef} className={`mobile-navigation ${mobileOpen ? "is-open" : ""}`} id="mobile-public-navigation" hidden={!mobileOpen}>
        <nav aria-label="Mobile navigation">
          {navigationGroups.map((group) => (
            <details key={group.label}>
              <summary>{group.label}<ChevronDown size={16} /></summary>
              <Link href={group.featured.href} onClick={closeMenus}><strong>{group.featured.label}</strong><span>{group.featured.description}</span></Link>
              {group.items.map((item) => <Link href={item.href} key={item.href} onClick={closeMenus}><strong>{item.label}</strong><span>{item.description}</span></Link>)}
            </details>
          ))}
          <Link className="mobile-pricing-link" href="/pricing" onClick={closeMenus}>Pricing</Link>
          <div className="mobile-navigation-actions"><Link href="/sign-in" className="public-button ghost" onClick={closeMenus}>Sign in</Link><Link href="/studio" className="public-button" onClick={closeMenus}>Open Studio <ArrowRight size={15} /></Link></div>
        </nav>
      </div>
    </>
  );
}
