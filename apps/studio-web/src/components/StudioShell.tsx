"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut, Menu, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { navigation, pageMeta } from "@/data/platform";
import { useAuth } from "./AuthContext";
import { BrandLogo } from "./BrandLogo";
import { useGuide } from "./GuideProvider";

const navItems = navigation.flatMap((group) => group.items);

function greetingForHour(hour: number) {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function StudioShell({ section, children }: { section: string; children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuth();
  const { guidedMode, setGuidedMode } = useGuide();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [notificationsRead, setNotificationsRead] = useState(false);
  const [pendingIdentities, setPendingIdentities] = useState(0);
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

  useEffect(() => {
    fetch("/api/v1/dashboard")
      .then((response) => response.json())
      .then((payload) => setPendingIdentities(Number(payload?.data?.counts?.pending_identities ?? 0)))
      .catch(() => setPendingIdentities(0));
  }, [section]);

  function quickAction() {
    if (section === "dashboard") {
      router.push("/studio/workforce/create");
      return;
    }
    if (section === "workforce") { router.push("/studio/workforce/create"); return; }
    if (section === "tasks") { document.querySelector<HTMLElement>("#studio-primary-action")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (section === "approvals") { document.querySelector<HTMLElement>(".approvals-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (section === "workforce-analytics") { window.location.reload(); return; }
    if (section === "digital-humans") {
      window.dispatchEvent(new CustomEvent("studio:new-digital-human"));
      return;
    }
    if (section === "live-sessions") {
      window.dispatchEvent(new CustomEvent("studio:start-test-session"));
      return;
    }
    if (section === "presenter-studio") {
      window.dispatchEvent(new CustomEvent("studio:new-presenter-project"));
      return;
    }
    if (section === "usage") { window.dispatchEvent(new CustomEvent("studio:export-usage")); return; }
    if (section === "audit-logs") { window.dispatchEvent(new CustomEvent("studio:export-audit")); return; }
    if (section === "settings") { window.dispatchEvent(new CustomEvent("studio:save-settings")); return; }
    if (section === "learn") { document.querySelector<HTMLElement>(".guide-library-card button")?.click(); return; }
    const target = document.querySelector<HTMLElement>("#studio-primary-action") ?? document.querySelector<HTMLElement>(".content-stack form");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => target.querySelector<HTMLElement>("input, textarea, select, button")?.focus(), 300);
      return;
    }
    setNotice(`${meta.action} controls are visible on this page.`);
    window.setTimeout(() => setNotice(null), 3200);
  }

  function openNotifications() {
    setNotificationsRead(true);
    setNotice(pendingIdentities > 0 ? `${pendingIdentities} ${pendingIdentities === 1 ? "identity is" : "identities are"} awaiting owner verification.` : "No identity approvals are awaiting review.");
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
          <div><strong>Persistent workspace</strong><small>External providers are configuration-gated</small></div>
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
                    {item.label === "Identity & Consent" && pendingIdentities > 0 && <b className="nav-count">{pendingIdentities}</b>}
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
            <button
              className="guided-mode-toggle"
              type="button"
              aria-pressed={guidedMode}
              onClick={() => setGuidedMode(!guidedMode)}
              title={guidedMode ? "Guided Mode: suggestions and guides are surfaced automatically" : "Expert Mode: Studio stays quiet — Guide Library remains available"}
            >
              <i className={guidedMode ? "on" : ""} />
              {guidedMode ? "Guided Mode" : "Expert Mode"}
            </button>
            <span className="ai-disclosure-chip"><i /> AI systems disclosed</span>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={openNotifications}><Bell size={19} />{!notificationsRead && pendingIdentities > 0 && <b>{pendingIdentities}</b>}</button>
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
          <div className="studio-data-notice" role="note"><strong>Live workspace</strong><span>Studio changes persist to your organisation database. Provider-backed media and realtime features run only when their server-side capability gates are configured.</span></div>
          {children}
        </div>
      </main>

      {notice && <div className="toast" role="status"><span>✓</span>{notice}</div>}
    </div>
  );
}
