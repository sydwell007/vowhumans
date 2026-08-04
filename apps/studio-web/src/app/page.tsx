import { StudioShell } from "@/components/StudioShell";
import { StudioView } from "@/components/StudioView";

export default function DashboardPage() {
  return (
    <StudioShell section="dashboard">
      <StudioView section="dashboard" />
    </StudioShell>
  );
}

