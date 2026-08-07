"use client";

import { createContext, useContext } from "react";

export type AuthedUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  organisationId: string;
  organisationName: string;
  organisationSlug: string;
};

const AuthContext = createContext<AuthedUser | null>(null);

export function AuthProvider({ user, children }: { user: AuthedUser; children: React.ReactNode }) {
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

// Only usable inside AuthProvider (studio/layout.tsx and the admin page both require a
// session before rendering their children), so a real user is always present here.
export function useAuth(): AuthedUser {
  const user = useContext(AuthContext);
  if (!user) throw new Error("useAuth() must be used within an AuthProvider");
  return user;
}
