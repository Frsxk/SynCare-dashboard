import React, { type ReactNode } from "react";
import { ModuleNavigation } from "./module-navigation";

export interface NavigationItem { label: string; href?: string }
const pendingModules: NavigationItem[] = [
  { label: "Pasien" }, { label: "Pemantauan" }, { label: "Homecare" }, { label: "Eskalasi" },
];
export function Shell({ children, displayName, navigation = pendingModules }:
  { children?: ReactNode; displayName: string; navigation?: NavigationItem[] }) {
  return <div className="workspace">
    <a className="skip-link" href="#main-content">Lewati ke konten</a>
    <header className="workspace-header"><div className="workspace-identity"><strong className="brand">SynCare</strong><span>Dashboard perawat</span></div><div className="workspace-account"><span>Akun aktif</span><strong>{displayName}</strong></div></header>
    <div className="workspace-body">
      <ModuleNavigation navigation={navigation} />
      <main id="main-content" tabIndex={-1}>{children}</main>
    </div>
  </div>;
}

