import { MarketingShell } from "@/components/MarketingShell";
import { RoiCalculator } from "@/components/CommercialInteractive";
import { EditorialVisual } from "@/components/EditorialVisual";

export const metadata = { title: "ROI Calculator" };

export default function Page() {
  return (
    <MarketingShell>
      <section className="commercial-page-hero has-editorial-visual">
        <div className="commercial-page-hero-copy">
          <p className="commercial-kicker"><span />TRANSPARENT BUSINESS CASE</p>
          <h1>Model the value before making the promise.</h1>
          <p>Change the operational assumptions and export a directional estimate. This calculator is not a quote, financial advice or a guarantee of savings.</p>
        </div>
        <EditorialVisual variant="workforce" priority />
      </section>
      <div className="commercial-page-body"><RoiCalculator /></div>
    </MarketingShell>
  );
}
