"use client";
import Link from "next/link";
import { visitTime } from "@/features/homecare/contracts";
import { sourceLabels, statusLabels, type AlertSource } from "./contracts";
// Manual patient requests carry no F2 report or attempt, so they must never reuse the report link or outcome wording.
export function AlertSourceSummary({ source, status }: { source: AlertSource; status: keyof typeof statusLabels }) {
  return <><p>Sumber: {sourceLabels[source.type]}. Status: {statusLabels[status]}</p><p>{source.reason}</p>
    {source.type === "F2" ? <p>Laporan: {visitTime(source.reportedAt)}</p> : <p>Diminta pada: {visitTime(source.reportedAt)}</p>}</>;
}
export function AlertSourceEvidence({ source }: { source: AlertSource }) {
  if (source.type === "F2") return <>
    <p>Prioritas sumber: {sourceLabels.F2}. {source.reason}</p>
    <p>Laporan: {visitTime(source.reportedAt)}</p>
    <p>Hasil F2 dicatat: {visitTime(source.outcomeAt)}</p>
    <Link href={`/monitoring/reports/${source.reportId}`}>Buka laporan sumber</Link>
  </>;
  return <>
    <p>Prioritas sumber: {sourceLabels.PATIENT_REQUEST}. {source.reason}</p>
    <p>Diminta pada: {visitTime(source.reportedAt)}</p>
    {source.outcomeAt && <p>Tercatat pada: {visitTime(source.outcomeAt)}</p>}
    <p>ID permintaan: {source.requestId}</p>
    <p>Permintaan ini dicatat untuk direview perawat. Dashboard ini tidak menghubungi layanan darurat dan tidak mengirim ambulans.</p>
  </>;
}
