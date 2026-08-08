import { MarketingShell } from "@/components/MarketingShell";

export default function Loading() {
  return (
    <MarketingShell>
      <section className="loading-screen" aria-label="Loading VowHumans" aria-live="polite">
        <span className="loading-orb" aria-hidden="true" />
        <p>Preparing your VowHumans experience</p>
        <div><i /><i /><i /></div>
      </section>
    </MarketingShell>
  );
}
