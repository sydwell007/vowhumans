import { MarketingShell } from "./MarketingShell";
import { AuthForm, LeadForm } from "./CommercialInteractive";
import { EditorialVisual, type EditorialVisualVariant } from "./EditorialVisual";

export function LeadPage({kind}:{kind:"demo"|"contact"|"signup"|"signin"|"partner"|"investor"|"trust"|"support"}){
  const variant: EditorialVisualVariant = kind === "trust"
    ? "governance"
    : kind === "demo" || kind === "support"
      ? "experience"
      : "enterprise";

  return <MarketingShell><div className="lead-page"><EditorialVisual variant={variant} priority decorative className="lead-editorial-visual" sizes="(max-width: 860px) 100vw, 50vw"/>{kind==="signin"||kind==="signup"?<AuthForm kind={kind}/>:<LeadForm kind={kind}/>}</div></MarketingShell>;
}
