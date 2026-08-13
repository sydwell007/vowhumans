import sql from "@/lib/db";

export type ResolvedFace = { data: Buffer; mimeType: string };

// Chains human_face_assignments (slug -> face_asset_id) -> face_assets (id -> object_key)
// -> media_blobs (object_key -> raw bytes), the same three tables and the same explicit
// organisation_id filter at every step that apps/studio-web's faces/:id/image route
// already uses — this is the same lookup, just callable without a session cookie, for
// callers (the avatar-participant service) that authenticate with a shared internal key
// instead of a browser session.
export async function resolveFaceBytes(organisationId: string, humanSlug: string): Promise<ResolvedFace | null> {
  const [assignment] = await sql<{ face_asset_id: string }[]>`
    SELECT face_asset_id FROM human_face_assignments WHERE organisation_id = ${organisationId} AND human_slug = ${humanSlug}
  `;
  if (!assignment) return null;

  const [face] = await sql<{ object_key: string }[]>`
    SELECT object_key FROM face_assets WHERE id = ${assignment.face_asset_id} AND organisation_id = ${organisationId}
  `;
  if (!face) return null;

  const [blob] = await sql<{ data: Buffer; mime_type: string }[]>`
    SELECT data, mime_type FROM media_blobs WHERE object_key = ${face.object_key} AND organisation_id = ${organisationId}
  `;
  if (!blob) return null;

  return { data: blob.data, mimeType: blob.mime_type };
}
