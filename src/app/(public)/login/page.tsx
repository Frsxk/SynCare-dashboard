import { LoginForm } from "@/components/auth/login-form";
export const dynamic = "force-dynamic";
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <main className="welcome auth-page"><p className="brand">SynCare</p><h1>Masuk ke dashboard perawat</h1><p className="welcome-description">Akses tindak lanjut pasien sesuai kewenangan dan penugasan Anda.</p><div className="auth-card"><LoginForm revokeUnconfirmed={query.logout === "unconfirmed"} /></div></main>;
}
