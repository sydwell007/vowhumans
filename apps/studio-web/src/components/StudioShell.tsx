"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, Menu, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { navigation, pageMeta } from "@/data/platform";

const navItems = navigation.flatMap((group) => group.items);

export function StudioShell({ section, children }: { section: string; children: React.ReactNode }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const meta = pageMeta[section];
  const results = query.trim()
    ? navItems.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())).slice(0, 5)
    : [];

  function quickAction() {
    const outcome: Record<string, string> = {
      dashboard: "A safe digital-human draft is ready for identity and Persona setup.",
      "identity-consent": "Identity registration opened in draft mode; publication remains blocked.",
      "presenter-studio": "A new presenter project draft is ready below.",
      "api-keys": "Key creation is ready; production keys are displayed once and stored hashed.",
    };
    setNotice(outcome[section] ?? `${meta.action} opened in safe draft mode.`);
    window.setTimeout(() => setNotice(null), 4200);
  }

  return (
    <div className="studio-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <Link href="/" className="brand" onClick={() => setMobileOpen(false)}>
            <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
            <span><strong>Vow</strong>Humans<small>Digital Human Platform</small></span>
          </Link>
          <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={19} /></button>
        </div>

        <div className="environment-card">
          <span className="pulse-dot" />
          <div><strong>Development workspace</strong><small>Safe mock providers active</small></div>
          <ChevronDown size={15} />
        </div>

        <nav className="main-nav" aria-label="Studio navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const active = (section === "dashboard" && item.slug === "") || section === item.slug;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.slug ? `/${item.slug}` : "/"}
                    className={active ? "active" : ""}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>
                    {item.label === "Identity & Consent" && <b className="nav-count">2</b>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="demo-callout">
          <span>TRY THE EXPERIENCE</span>
          <strong>See VowHumans in action</strong>
          <div className="demo-links">
            <Link href="/demos/interview">Interview</Link>
            <Link href="/demos/tutor">Tutor</Link>
            <Link href="/demos/presenter">Present</Link>
          </div>
        </div>

        <div className="sidebar-profile">
          <span className="avatar-initials">NM</span>
          <div><strong>Naledi M.</strong><small>Platform owner</small></div>
          <span className="more-dots">•••</span>
        </div>
      </aside>

      {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}

      <main className="studio-main">
        <header className="topbar">
          <button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <div className="search-wrap">
            <Search size={18} />
            <input
              aria-label="Search Studio"
              placeholder="Search Studio…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && results[0]) {
                  router.push(results[0].slug ? `/${results[0].slug}` : "/");
                  setQuery("");
                }
              }}
            />
            <kbd>⌘ K</kbd>
            {results.length > 0 && (
              <div className="search-results">
                {results.map((result) => (
                  <button key={result.label} onClick={() => { router.push(result.slug ? `/${result.slug}` : "/"); setQuery(""); }}>
                    <result.icon size={17} /><span>{result.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="topbar-actions">
            <span className="ai-disclosure-chip"><i /> AI systems disclosed</span>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={19} /><b>2</b></button>
          </div>
        </header>

        <div className="page-wrap">
          <section className="page-heading">
            <div>
              <p className="eyebrow">{meta.eyebrow}</p>
              <h1>{meta.title}</h1>
              <p className="page-description">{meta.description}</p>
            </div>
            <button className="primary-button" onClick={quickAction}><Plus size={18} />{meta.action}</button>
          </section>
          {children}
        </div>
      </main>

      {notice && <div className="toast" role="status"><span>✓</span>{notice}</div>}
    </div>
  );
}
