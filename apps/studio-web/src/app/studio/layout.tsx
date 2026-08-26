import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";
import { AuthProvider } from "@/components/AuthContext";
import { GuideProvider } from "@/components/GuideProvider";
import { FollowAlongPanel } from "@/components/FollowAlongPanel";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const user = token ? await readSession(token) : null;
  if (!user) redirect("/sign-in?next=/studio");

  return (
    <AuthProvider user={{ id: user.id, email: user.email, displayName: user.displayName, role: user.role, organisationId: user.organisationId, organisationName: user.organisationName, organisationSlug: user.organisationSlug }}>
      <GuideProvider>
        {children}
        <FollowAlongPanel />
      </GuideProvider>
    </AuthProvider>
  );
}
