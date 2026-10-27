import { resolveNurseSession } from "@/lib/auth/server";
import { RegistryPage } from "@/features/patients/patient-workspace";
export default async function PatientsPage() {
  const session = await resolveNurseSession();
  if (!session) return null;
  return <RegistryPage principalId={session.principal.id} csrfToken={session.csrfToken} canManage={session.principal.capabilities?.includes("patient.manage") ?? false} />;
}
