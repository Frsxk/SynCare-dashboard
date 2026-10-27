"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "../ui/button";
import { useHydrated } from "./use-hydrated";

const schema = z.object({ identifier: z.string().trim().min(1, "Isi identitas akun.").max(320), password: z.string().min(1, "Isi kata sandi.").max(128) });
type LoginInput = z.infer<typeof schema>;

const loginFailureCopy = {
  origin_not_allowed: "Permintaan masuk ditolak karena alamat dashboard tidak sesuai. Buka dashboard melalui alamat yang diberikan operator, lalu coba lagi.",
  forbidden: "Gunakan akun perawat yang berwenang. Akun pasien digunakan melalui aplikasi pasien.",
  unauthenticated: "Akun atau kata sandi tidak sesuai.",
  rate_limited: "Terlalu banyak percobaan masuk. Coba kembali nanti.",
  validation_failed: "Periksa kembali data yang dikirim.",
  dependency_unavailable: "Belum dapat terhubung. Periksa koneksi lalu coba lagi.",
} as const;

// Only a bounded, recognized machine code may select copy. Server text, Origin and identifiers are never rendered.
export function loginFailureMessage(status: number, payload: unknown): string {
  const nested = payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null;
  const code = nested && typeof nested === "object" && "code" in nested ? (nested as { code?: unknown }).code : null;
  if (typeof code === "string" && code.length <= 64 && Object.prototype.hasOwnProperty.call(loginFailureCopy, code)) {
    return loginFailureCopy[code as keyof typeof loginFailureCopy];
  }
  if (status === 401) return loginFailureCopy.unauthenticated;
  if (status === 429) return loginFailureCopy.rate_limited;
  if (status === 422) return loginFailureCopy.validation_failed;
  if (status === 403) return "Masuk tidak dapat dilakukan. Hubungi operator bila masalah berlanjut.";
  return "Belum dapat terhubung. Periksa koneksi lalu coba lagi.";
}

export function LoginForm({ revokeUnconfirmed = false }: { revokeUnconfirmed?: boolean }) {
  const hydrated = useHydrated();
  const [failure, setFailure] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({ resolver: zodResolver(schema) });
  const submit = handleSubmit(async input => {
    setFailure(null);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), credentials: "same-origin", cache: "no-store", redirect: "error" });
      if (!response.ok) {
        const raw = await response.text();
        let payload: unknown = null;
        if (raw.length <= 2048) { try { payload = JSON.parse(raw); } catch { payload = null; } }
        setFailure(loginFailureMessage(response.status, payload));
        return;
      }
      const channel = new BroadcastChannel("syncare-session");
      channel.postMessage("changed"); channel.close();
      window.location.replace("/workspace");
    } catch { setFailure("Belum dapat terhubung. Periksa koneksi lalu coba lagi."); }
  });
  return <form className="auth-form" onSubmit={submit} noValidate>
    <div><label htmlFor="identifier">Identitas akun</label><input id="identifier" autoComplete="username" maxLength={320} aria-invalid={!!errors.identifier} aria-describedby={errors.identifier ? "identifier-error" : undefined} {...register("identifier")} />{errors.identifier && <p id="identifier-error" role="alert">{errors.identifier.message}</p>}</div>
    <div><label htmlFor="password">Kata sandi</label><input id="password" type="password" autoComplete="current-password" maxLength={128} aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} {...register("password")} />{errors.password && <p id="password-error" role="alert">{errors.password.message}</p>}</div>
    {failure && <p role="alert">{failure}</p>}
    {revokeUnconfirmed && <p role="status">Akses lokal telah ditutup. Pencabutan sesi di server belum terkonfirmasi.</p>}
    <Button type="submit" disabled={!hydrated || isSubmitting}>{isSubmitting ? "Memeriksa akun..." : "Masuk"}</Button>
    <p>Akun perawat diberikan oleh operator demo. Hubungi operator bila Anda belum memiliki akun.</p>
  </form>;
}
