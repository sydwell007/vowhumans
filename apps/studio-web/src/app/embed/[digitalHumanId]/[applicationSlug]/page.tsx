import { EmbedRoom } from "@/components/EmbedRoom";

// No site chrome on purpose — this page exists only to fill a partner site's
// <iframe>. digitalHumanId/applicationSlug are validated live by the public
// embed-sessions route, not here, so this stays a thin pass-through.
export default async function Page({ params }: { params: Promise<{ digitalHumanId: string; applicationSlug: string }> }) {
  const { digitalHumanId, applicationSlug } = await params;
  return <EmbedRoom digitalHumanId={digitalHumanId} applicationSlug={applicationSlug} />;
}
