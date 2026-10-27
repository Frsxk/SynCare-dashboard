import Link from "next/link";
export default function HomePage() {
  return <main className="welcome">
    <p className="brand">SynCare</p>
    <h1>Dashboard perawat</h1>
    <p className="welcome-description">Pendamping perawatan lanjutan setelah pasien pulang dari rumah sakit.</p>
    <p>Akses ruang kerja hanya untuk tenaga kesehatan yang berwenang.</p>
    <Link href="/login">Masuk ke akun perawat</Link>
  </main>;
}

