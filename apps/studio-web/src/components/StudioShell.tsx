"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut, Menu, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { identityAlertCount, navigation, pageMeta } from "@/data/platform";
import { useAuth } from "./AuthContext";
import { BrandLogo } from "./BrandLogo";

const navItems = navigation.flatMap((group) => group.items);

function greetingForHour(hour: number) {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function StudioShell({ section, children }: { section: string; children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [notificationsRead, setNotificationsRead] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const meta = pageMeta[section];
  const results = query.trim()
    ? navItems.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())).slice(0, 5)
    : [];

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  function quickAction() {
    const outcome: Record<string, string> = {
      dashboard: "A safe digital-human draft is ready for identity and Persona setup.",
      "identity-consent": "Identity registration opened in draft mode; publication remains blocked.",
      "presenter-studio": "A new presenter project draft is ready below.",
      "api-keys": "Key creation is ready; production keys are displayed once and stored hashed.",
      "live-sessions": "A disclosed mock test session is starting; no real microphone or provider is used.",
      usage: "A usage report draft was generated from the illustrative data shown below; no live provider invoice is connected.",
      "audit-logs": "An audit export draft was generated from the visible event history below.",
      safety: "This concern has been recorded locally for review; nothing was sent to a live system.",
      settings: "Your changes are saved locally to this preview session only.",
    };
    setNotice(outcome[section] ?? `${meta.action} opened in safe draft mode.`);
    window.setTimeout(() => setNotice(null), 4200);
  }

  function openNotifications() {
    setNotificationsRead(true);
    setNotice(`${identityAlertCount} ${identityAlertCount === 1 ? "identity is" : "identities are"} awaiting owner verification · disclosure checks are passing.`);
    window.setTimeout(() => setNotice(null), 4200);
  }

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="studio-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <Link href="/studio" className="brand" aria-label="VowHumans Studio home" onClick={() => setMobileOpen(false)}>
            <BrandLogo variant="lockup" priority />
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
                    href={item.slug ? `/studio/${item.slug}` : "/studio"}
                    className={active ? "active" : ""}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>
                    {item.label === "Identity & Consent" && identityAlertCount > 0 && <b className="nav-count">{identityAlertCount}</b>}
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
          <span className="avatar-initials">{user.displayName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
          <div><strong>{user.displayName}</strong><small>{user.organisationName}</small></div>
          <button className="icon-button" aria-label="Log out" onClick={logout}><LogOut size={16} /></button>
        </div>
      </aside>

      {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}

      <main className="studio-main">
        <header className="topbar">
          <button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <div className="search-wrap">
            <Search size={18} />
            <input
              ref={searchInputRef}
              aria-label="Search Studio"
              placeholder="Search Studio…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && results[0]) {
                  router.push(results[0].slug ? `/studio/${results[0].slug}` : "/studio");
                  setQuery("");
                }
              }}
            />
            <kbd>⌘ K</kbd>
            {results.length > 0 && (
              <div className="search-results">
                {results.map((result) => (
                  <button key={result.label} onClick={() => { router.push(result.slug ? `/studio/${result.slug}` : "/studio"); setQuery(""); }}>
                    <result.icon size={17} /><span>{result.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="topbar-actions">
            <span className="ai-disclosure-chip"><i /> AI systems disclosed</span>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={openNotifications}><Bell size={19} />{!notificationsRead && identityAlertCount > 0 && <b>{identityAlertCount}</b>}</button>
          </div>
        </header>

        <div className="page-wrap">
          <section className="page-heading">
            <div>
              <p className="eyebrow">{section === "dashboard" ? new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" }) : meta.eyebrow}</p>
              <h1>{section === "dashboard" ? `${greetingForHour(new Date().getHours())}, ${user.displayName.split(" ")[0]}` : meta.title}</h1>
              <p className="page-description">{meta.description}</p>
            </div>
            <button className="primary-button" onClick={quickAction}><Plus size={18} />{meta.action}</button>
          </section>
          <div className="studio-data-notice" role="note"><strong>Preview dataset</strong><span>Records and activity shown in Studio are local product examples. Usage, billing, provider health and organisation persistence are not connected.</span></div>
          {children}
        </div>
      </main>

      {notice && <div className="toast" role="status"><span>✓</span>{notice}</div>}
    </div>
  );
}
