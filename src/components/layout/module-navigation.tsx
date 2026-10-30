"use client";

import Link from "next/link.js";
import { usePathname } from "next/navigation.js";
import { Activity, House, HousePlus, Siren, UsersRound } from "lucide-react";
import type { NavigationItem } from "./shell";

const moduleIcons = { Beranda: House, Pasien: UsersRound, Pemantauan: Activity, Homecare: HousePlus, Eskalasi: Siren };

export function ModuleNavigation({ navigation }: { navigation: NavigationItem[] }) {
  const pathname = usePathname() ?? "";
  return <nav aria-label="Navigasi perawat"><ul className="module-list">{navigation.map((item) => {
    const Icon = moduleIcons[item.label as keyof typeof moduleIcons];
    const active = item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`));
    return <li key={item.label}>{item.href
      ? <Link href={item.href} aria-current={active ? "page" : undefined}>{Icon && <Icon size={20} aria-hidden="true" />}<span>{item.label}</span></Link>
      : <span aria-disabled="true">{item.label}<small>Belum tersedia</small></span>}</li>;
  })}</ul></nav>;
}
