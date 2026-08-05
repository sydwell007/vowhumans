import { StudioShell } from "@/components/StudioShell";
import { StudioView } from "@/components/StudioView";
export const metadata = { title: "Studio" };
export default function StudioPage(){return <StudioShell section="dashboard"><StudioView section="dashboard"/></StudioShell>}
