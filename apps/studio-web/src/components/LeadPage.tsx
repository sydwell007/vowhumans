import { MarketingShell } from "./MarketingShell";
import { LeadForm } from "./CommercialInteractive";
export function LeadPage({kind}:{kind:"demo"|"contact"|"signup"|"signin"|"partner"|"investor"|"trust"|"support"}){return <MarketingShell><div className="lead-page"><LeadForm kind={kind}/></div></MarketingShell>}
