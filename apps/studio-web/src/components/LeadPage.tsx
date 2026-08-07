import { MarketingShell } from "./MarketingShell";
import { AuthForm, LeadForm } from "./CommercialInteractive";
export function LeadPage({kind}:{kind:"demo"|"contact"|"signup"|"signin"|"partner"|"investor"|"trust"|"support"}){
  return <MarketingShell><div className="lead-page">{kind==="signin"||kind==="signup"?<AuthForm kind={kind}/>:<LeadForm kind={kind}/>}</div></MarketingShell>;
}
