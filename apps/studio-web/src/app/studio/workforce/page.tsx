import { StudioShell } from "@/components/StudioShell";
import { WorkforceStudio } from "@/components/WorkforceStudio";

export const metadata = { title: "Digital Colleagues", description: "Design, govern, deploy and supervise accountable Digital Colleagues." };

export default function WorkforcePage() {
  return <StudioShell section="workforce"><WorkforceStudio /></StudioShell>;
}
