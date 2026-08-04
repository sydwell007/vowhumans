import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <div className="brand-mark">VH</div>
      <p className="eyebrow">404 · Outside the Persona scope</p>
      <h1>That Studio page doesn’t exist.</h1>
      <Link className="primary-button" href="/">Return to dashboard</Link>
    </main>
  );
}

