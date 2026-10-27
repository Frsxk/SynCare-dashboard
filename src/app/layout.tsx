import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = { title: "SynCare: Dashboard perawat", description: "Pendamping perawatan lanjutan setelah kepulangan. Demo sintetis." };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="id"><body><div className="demo-notice" role="note">Demo sintetis. Belum divalidasi klinis.</div>{children}</body></html>;
}

