import { resolveNurseSession } from "@/lib/auth/server";
import { LogoutButton } from "@/components/auth/session-controls";
import Link from "next/link.js";
import { Activity, HousePlus, Siren, UsersRound } from "lucide-react";

const tasks = [
  { href: "/patients", title: "Pasien", description: "Buka profil pasien, ringkasan pulang, dan rencana perawatan.", icon: UsersRound },
  { href: "/monitoring", title: "Pemantauan", description: "Tinjau laporan check-in dan hasil pemrosesan pasien.", icon: Activity },
  { href: "/homecare", title: "Homecare", description: "Tinjau pengajuan dan kelola jadwal kunjungan simulasi.", icon: HousePlus },
  { href: "/escalations", title: "Eskalasi", description: "Akui laporan mendesak dan catat tindak lanjutnya.", icon: Siren },
];
export default async function WorkspacePage() {
  const session = await resolveNurseSession();
  if (!session) return null;
  return <><h1>Ruang kerja perawat</h1><p className="welcome-description">Data pasien hanya tersedia melalui akses yang terverifikasi.</p>
    <div className="workspace-tasks">{tasks.map(({ href, title, description, icon: Icon }) => <Link className="task-card" href={href} key={href}><Icon size={24} aria-hidden="true" /><div><h2>{title}</h2><p>{description}</p></div></Link>)}</div>
    <section className="session-panel" aria-label="Sesi akun"><div><h2>Sesi akun</h2><p>Sesi berlaku paling lama 24 jam sejak masuk.</p></div><LogoutButton csrfToken={session.csrfToken} /></section></>;
}

