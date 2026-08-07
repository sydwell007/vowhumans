import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";
import { AuthProvider } from "@/components/AuthContext";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const user = token ? await readSession(token) : null;
  if (!user) redirect("/sign-in?next=/admin");
  if (user.role !== "owner" && user.role !== "admin") {
    return (
      <div className="lead-page">
        <div className="lead-layout">
          <section>
            <p className="commercial-kicker"><span />NOT AUTHORIZED</p>
            <h1>Your account doesn’t have admin access.</h1>
            <p>Platform administration is restricted to the owner and admin roles on your workspace.</p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider user={{ id: user.id, email: user.email, displayName: user.displayName, role: user.role, organisationId: user.organisationId, organisationName: user.organisationName, organisationSlug: user.organisationSlug }}>
      {children}
    </AuthProvider>
  );
}
