"use client";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { useHydrated } from "./use-hydrated";

export function LogoutButton({ csrfToken }: { csrfToken: string }) {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  return <Button variant="outline" disabled={!hydrated || busy} onClick={async () => {
    setBusy(true);
    document.cookie = `syncare_signed_out=1; Path=/; SameSite=Lax; Max-Age=86400${location.protocol === "https:" ? "; Secure" : ""}`;
    window.dispatchEvent(new Event("syncare-logout-start"));
    const channel = new BroadcastChannel("syncare-session");
    channel.postMessage("changed"); channel.close();
    let confirmed = false;
    try {
      const response = await fetch("/api/auth/session", { method: "DELETE", headers: { "X-CSRF-Token": csrfToken }, credentials: "same-origin", cache: "no-store", redirect: "error" });
      confirmed = response.ok && (await response.json()).data?.revoked === true;
    } catch {
      window.dispatchEvent(new Event("syncare-logout-unconfirmed"));
      return;
    }
    window.location.replace(confirmed ? "/login" : "/login?logout=unconfirmed");
  }}>{busy ? "Menutup sesi..." : "Keluar"}</Button>;
}

export function SessionGuard({ principalId, csrfToken, children }: { principalId: string; csrfToken: string; children: React.ReactNode }) {
  const [phase, setPhase] = useState<"content" | "checking" | "unverified" | "signed-out" | "signed-out-unconfirmed">("content");
  useEffect(() => {
    let generation = 0;
    let disposed = false;
    let localClosed = false;
    const hide = () => { document.getElementById("private-session-content")?.setAttribute("hidden", ""); };
    const check = async () => {
      if (localClosed) return;
      const current = ++generation;
      hide(); setPhase("checking");
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin", redirect: "error" });
        if (disposed || current !== generation) return;
        if (response.status === 401) { window.location.replace("/login"); return; }
        if (!response.ok) { setPhase("unverified"); return; }
        const body = await response.json();
        if (disposed || current !== generation) return;
        if (body.data?.principal.id !== principalId || body.data?.csrfToken !== csrfToken) { window.location.replace("/workspace"); return; }
        document.getElementById("private-session-content")?.removeAttribute("hidden");
        setPhase("content");
      } catch { if (!disposed && current === generation) setPhase("unverified"); }
    };
    const show = (event: PageTransitionEvent) => { if (event.persisted) void check(); };
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    document.addEventListener("visibilitychange", visible);
    const channel = new BroadcastChannel("syncare-session");
    channel.onmessage = () => { void check(); };
    const close = () => { localClosed = true; generation++; hide(); setPhase("signed-out"); };
    const unconfirmed = () => { localClosed = true; generation++; hide(); setPhase("signed-out-unconfirmed"); };
    window.addEventListener("syncare-logout-start", close);
    window.addEventListener("syncare-logout-unconfirmed", unconfirmed);
    return () => { disposed = true; generation++; channel.close(); window.removeEventListener("pagehide", hide); window.removeEventListener("pageshow", show); document.removeEventListener("visibilitychange", visible); window.removeEventListener("syncare-logout-start", close); window.removeEventListener("syncare-logout-unconfirmed", unconfirmed); };
  }, [principalId, csrfToken]);
  if (phase === "signed-out" || phase === "signed-out-unconfirmed") return <main className="welcome"><h1>Akses lokal telah ditutup</h1><p role="status">{phase === "signed-out" ? "Mencabut sesi di server..." : "Pencabutan sesi di server belum terkonfirmasi. Sesi akan tetap dibatasi masa berlakunya."}</p>{phase === "signed-out-unconfirmed" && <a href="/login?logout=unconfirmed">Masuk kembali saat koneksi tersedia</a>}</main>;
  return <>{phase !== "content" && <div role="status"><p>{phase === "unverified" ? "Sesi belum dapat diverifikasi. Data disembunyikan sampai koneksi tersedia." : "Memeriksa sesi..."}</p>{phase === "unverified" && <Button onClick={() => window.location.reload()}>Periksa sesi lagi</Button>}</div>}<div id="private-session-content" hidden={phase !== "content"}>{children}</div></>;
}

export function SessionUnavailable() {
  return <main className="welcome"><h1>Sesi belum terverifikasi</h1><p>Belum dapat terhubung ke layanan. Data pasien belum dapat dibuka.</p><Button onClick={() => window.location.reload()}>Periksa sesi lagi</Button></main>;
}
