import { StudioShell } from "@/components/StudioShell";
import { GuideLibrary } from "@/components/GuideLibrary";

export const metadata = { title: "Guide Library", description: "Real, click-validated guides that run directly on your own Studio." };

export default function LearnPage() {
  return <StudioShell section="learn"><GuideLibrary /></StudioShell>;
}
