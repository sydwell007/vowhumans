import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sql from "@/lib/db";

// TEMPORARY diagnostic route — delete this file once the registration issue is confirmed
// fixed. Not linked from anywhere, but don't leave it deployed longer than needed.
export async function GET() {
  const report: Record<string, unknown> = {};

  function describe(error: unknown) {
    return { message: error instanceof Error ? error.message : String(error), code: (error as { code?: string } | null)?.code ?? null };
  }

  try {
    const who = await sql<{ current_user: string; session_user: string }[]>`SELECT current_user, session_user`;
    report.role = who[0];

    const bypass = await sql<{ rolbypassrls: boolean }[]>`SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    report.rolbypassrls = bypass[0]?.rolbypassrls ?? null;

    const rls = await sql<{ tablename: string; rowsecurity: boolean }[]>`SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('users','organisations','web_sessions') AND schemaname = 'public'`;
    report.rowSecurity = rls;

    const testSlug = `diag-${randomUUID().slice(0, 8)}`;
    let orgId: string | null = null;
    let userId: string | null = null;

    try {
      const [org] = await sql<{ id: string }[]>`INSERT INTO organisations (name, slug) VALUES ('Diag Test', ${testSlug}) RETURNING id`;
      orgId = org.id;
      report.organisationInsert = "ok";
    } catch (error) {
      report.organisationInsert = describe(error);
    }

    if (orgId) {
      try {
        const [user] = await sql<{ id: string }[]>`INSERT INTO users (organisation_id, email, display_name, role, password_hash) VALUES (${orgId}, ${`${testSlug}@example.invalid`}, 'Diag', 'owner', 'x:y') RETURNING id`;
        userId = user.id;
        report.userInsert = "ok";
      } catch (error) {
        report.userInsert = describe(error);
      }
    }

    if (orgId && userId) {
      try {
        await sql`INSERT INTO web_sessions (user_id, organisation_id, token_hash, expires_at) VALUES (${userId}, ${orgId}, ${`diagtoken-${testSlug}`}, ${new Date(Date.now() + 60000)})`;
        report.webSessionInsert = "ok";
        await sql`DELETE FROM web_sessions WHERE user_id = ${userId}`;
      } catch (error) {
        report.webSessionInsert = describe(error);
      }
    }

    if (userId) await sql`DELETE FROM users WHERE id = ${userId}`.catch(() => {});
    if (orgId) await sql`DELETE FROM organisations WHERE id = ${orgId}`.catch(() => {});
    report.cleanup = "done";
  } catch (error) {
    report.fatal = describe(error);
  }

  return NextResponse.json(report);
}
