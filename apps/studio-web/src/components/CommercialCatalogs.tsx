"use client";

import Link from "next/link";
import { ArrowRight, Check, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { plans, subscriptionPriceMinor } from "@vowhumans/commercial-core";
import { templates } from "@/data/commercial";

type BillingInterval = "monthly" | "annual";

function money(minor: number | null, divisor = 1) {
  if (minor === null) return "Contact sales";
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(minor / 100 / divisor);
}

export function PricingCatalog() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  return (
    <>
      <div className="billing-toggle" aria-label="Choose billing interval">
        <div className="billing-options">
          <button type="button" className={interval === "monthly" ? "active" : ""} aria-pressed={interval === "monthly"} onClick={() => setInterval("monthly")}>Monthly</button>
          <button type="button" className={interval === "annual" ? "active" : ""} aria-pressed={interval === "annual"} onClick={() => setInterval("annual")}>Annual</button>
        </div>
        <small>{interval === "annual" ? "Annual commitment · modelled discount applied" : "Flexible monthly billing"}</small>
      </div>
      <div className="pricing-grid">
        {plans.map((plan) => {
          const annualMinor = subscriptionPriceMinor(plan.id, "annual");
          const displayMinor = interval === "annual" && annualMinor !== null ? annualMinor : plan.monthlyMinor;
          const divisor = interval === "annual" ? 12 : 1;
          return (
            <article key={plan.id} className={`pricing-card ${plan.id === "professional" ? "featured" : ""}`}>
              {plan.id === "professional" ? <span className="pricing-recommended">RECOMMENDED</span> : null}
              <p>{plan.audience}</p><h2>{plan.name}</h2>
              <strong>{money(displayMinor, divisor)}<small>{plan.monthlyMinor !== null ? "/month" : ""}</small></strong>
              <em>{plan.monthlyMinor === null ? "Custom limits and contract" : interval === "annual" ? "Billed annually · modelled launch discount" : "Billed monthly · switch or cancel under plan terms"}</em>
              <ul>{plan.features.map((feature) => <li key={feature}><Check size={13} />{feature}</li>)}</ul>
              <Link href={plan.status === "contact-sales" ? "/book-demo" : `/sign-up?plan=${plan.id}&billing=${interval}`} className="public-button">{plan.status === "contact-sales" ? "Request quote" : `Start with ${plan.name}`}</Link>
            </article>
          );
        })}
      </div>
    </>
  );
}

export function TemplateCatalog() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const categories = useMemo(() => ["All", ...Array.from(new Set(templates.map((template) => template.category)))], []);
  const filtered = useMemo(() => {
    const normalisedQuery = query.trim().toLowerCase();
    return templates.filter((template) => {
      const categoryMatches = category === "All" || template.category === category;
      const queryMatches = !normalisedQuery || `${template.name} ${template.description} ${template.industry} ${template.channels.join(" ")}`.toLowerCase().includes(normalisedQuery);
      return categoryMatches && queryMatches;
    });
  }, [category, query]);

  return (
    <>
      <div className="catalog-commandbar">
        <label><Search size={17} /><span className="sr-only">Search templates</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search roles, industries or channels" /></label>
        <div className="filter-chips catalog-filters" aria-label="Filter templates by category">
          {categories.map((item) => <button type="button" className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)} key={item}>{item}</button>)}
        </div>
      </div>
      <div className="catalog-result-count" role="status">{filtered.length} {filtered.length === 1 ? "template" : "templates"}</div>
      <div className="content-card-grid">
        {filtered.map((template) => <Link className="content-card link-card" href={`/templates/${template.slug}`} key={template.slug}><span className="commercial-status">{template.status}</span><h2>{template.name}</h2><p>{template.description}</p><small>{template.category} · {template.channels.join(" + ")}</small><b>{template.price} <ArrowRight size={14} /></b></Link>)}
      </div>
      {filtered.length === 0 ? <div className="catalog-empty"><Search size={24} /><h2>No matching templates</h2><p>Try another role, industry, channel or category.</p><button type="button" className="public-button ghost" onClick={() => { setQuery(""); setCategory("All"); }}>Clear filters</button></div> : null}
    </>
  );
}
