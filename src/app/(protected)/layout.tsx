import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { resolveNurseSession } from "@/lib/auth/server";
import { Shell } from "@/components/layout/shell";
import { nurseNavigation } from "@/components/layout/nurse-navigation";
import { SessionGuard, SessionUnavailable } from "@/components/auth/session-controls";

export const dynamic = "force-dynamic";
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  let session;
  try { session = await resolveNurseSession(); } catch { return <SessionUnavailable />; }
  if (!session) redirect("/login");
  return <SessionGuard principalId={session.principal.id} csrfToken={session.csrfToken}><Shell displayName={session.principal.displayName}
    principalId={session.principal.id} csrfToken={session.csrfToken} navigation={nurseNavigation}>{children}</Shell></SessionGuard>;
}

