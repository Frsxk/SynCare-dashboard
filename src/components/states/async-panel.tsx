"use client";

import React, { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ApiFailure } from "@/lib/api/client";

type RefreshState = { kind: "idle" } | { kind: "refreshing" } | { kind: "error"; failure: ApiFailure; onRetry: () => void };
export type PanelState =
  | { kind: "loading" }
  | { kind: "empty"; message: string; action?: ReactNode }
  | { kind: "no-matches"; onClear: () => void }
  | { kind: "error"; failure: ApiFailure; onRetry: () => void }
  | { kind: "content"; content: ReactNode; refresh?: RefreshState };

function recoveryLabel(failure: ApiFailure) {
  if (failure.code === "outcome_unknown") return "Periksa status";
  if (failure.code === "version_conflict") return "Muat data terbaru";
  if (failure.code === "unauthenticated" || failure.code === "session_changed") return "Masuk kembali";
  return "Coba lagi";
}

export function AsyncPanel({ state }: { state: PanelState }) {
  switch (state.kind) {
    case "loading":
      return <section className="data-panel" aria-busy="true"><p role="status">Memuat data…</p><div className="data-skeleton" aria-hidden="true" /></section>;
    case "empty":
      return <section className="data-panel"><p>{state.message}</p>{state.action}</section>;
    case "no-matches":
      return <section className="data-panel"><p>Tidak ada hasil yang cocok dengan filter.</p><Button variant="outline" onClick={state.onClear}>Hapus filter</Button></section>;
    case "error":
      return <section className="data-panel"><p role="alert">{state.failure.message}</p><Button variant="outline" onClick={state.onRetry}>{recoveryLabel(state.failure)}</Button></section>;
    case "content":
      return <section className="data-panel" aria-busy={state.refresh?.kind === "refreshing"}>
        {state.content}
        {state.refresh?.kind === "refreshing" && <p role="status">Memperbarui data…</p>}
        {state.refresh?.kind === "error" && <div><p role="alert">{state.refresh.failure.message}</p><Button variant="outline" onClick={state.refresh.onRetry}>{recoveryLabel(state.refresh.failure)}</Button></div>}
      </section>;
  }
}
