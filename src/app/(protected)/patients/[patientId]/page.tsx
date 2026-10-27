import { resolveNurseSession } from "@/lib/auth/server";
import { PatientDetailPage } from "@/features/patients/patient-workspace";
export default async function PatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const session = await resolveNurseSession();
  if (!session) return null;
  const { patientId } = await params;
  return <PatientDetailPage patientId={patientId} principalId={session.principal.id} csrfToken={session.csrfToken} />;
}
