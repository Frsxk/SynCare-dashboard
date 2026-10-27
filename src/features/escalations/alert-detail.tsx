"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { AsyncPanel, type PanelState } from "@/components/states/async-panel";
import { Button } from "@/components/ui/button";
import { ApiFailure } from "@/lib/api/client";
import { PatientSessionData, usePatientSession } from "@/features/patients/session-data";
import { visitTime } from "@/features/homecare/contracts";
import { alertEnvelope, alertMutation, statusLabels, actionTypeLabels, type AlertAction, type AlertDetail as Alert } from "./contracts";
import { AlertActionForms } from "./action-form";
export function AlertDetailPage(props: { principalId: string; csrfToken: string; alertId: string }) { return <PatientSessionData key={`${props.principalId}:${props.csrfToken}:${props.alertId}`} {...props}><AlertDetail alertId={props.alertId} /></PatientSessionData>; }
export function useAlertAction(alertId: string, onSaved: (alert: Alert, input: AlertAction) => Promise<void>, onConflict: () => void) {
  const session = usePatientSession(), intent = useRef<{ key: string; input: AlertAction } | null>(null), sending = useRef(false);
  const mutation = useMutation({ mutationFn: async (input: AlertAction) => {
    intent.current ??= { key: crypto.randomUUID(), input };
    if (JSON.stringify(intent.current.input) !== JSON.stringify(input)) throw new ApiFailure("outcome_unknown");
    const saved = await session.api.request(`/v1/alerts/${alertId}/actions`, { method: "POST", body: intent.current.input, idempotencyKey: intent.current.key, schema: alertMutation });
    if (saved.data.resource.id !== alertId) throw new ApiFailure("outcome_unknown");
    return saved.data.resource;
  }, onSuccess: async (value, input) => { intent.current = null; await onSaved(value, input); }, onError: error => {
    if (error instanceof ApiFailure && error.code !== "outcome_unknown") intent.current = null;
    if (error instanceof ApiFailure && error.code === "version_conflict") onConflict();
  }, onSettled: () => { sending.current = false; }, retry: false });
  const submit = (value: AlertAction) => { if (sending.current) return; sending.current = true; mutation.mutate(value); };
  return { ...mutation, submit, reconcile: () => { if (intent.current) submit(intent.current.input); } };
}
function AlertDetail({ alertId }: { alertId: string }) {
  const session = usePatientSession(), key = session.key(["alert", alertId]);
  const [followupRevision, setFollowupRevision] = useState(0);
  const query = useInfiniteQuery({ queryKey: key, gcTime: 0, initialPageParam: null as string | null, queryFn: async ({ pageParam, signal }) => {
    const response = await session.api.request(`/v1/alerts/${alertId}?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { schema: alertEnvelope, signal });
    if (response.data.id !== alertId) throw new ApiFailure("invalid_response"); return response;
  }, getNextPageParam: p => p.data.timelineNextCursor ?? undefined });
  const mutation = useAlertAction(alertId, async (alert, input) => {
    if (input.action === "follow_up") setFollowupRevision(value => value + 1);
    await session.query.cancelQueries({ queryKey: key, exact: true });
    session.query.setQueryData(key, { pages: [{ data: alert, requestId: "committed-alert-action" }], pageParams: [null] });
    await session.query.invalidateQueries({ queryKey: session.key(["alerts"]) });
    await session.query.invalidateQueries({ queryKey: session.key(["monitoring"]) });
  }, () => { void query.refetch(); });
  const failure = query.error instanceof ApiFailure ? query.error : new ApiFailure("processing_failed"), mutationFailure = mutation.error instanceof ApiFailure ? mutation.error : null;
  const denied = (query.isError && ["unauthenticated", "forbidden", "not_found", "session_changed"].includes(failure.code)) || (mutationFailure && ["unauthenticated", "forbidden", "not_found", "session_changed"].includes(mutationFailure.code));
  const unknown = mutationFailure?.code === "outcome_unknown", alert = denied ? null : query.data?.pages[0]?.data;
  const disabled = query.isFetching || query.isError || mutation.isPending || unknown;
  const refresh = () => { if (!unknown && !mutation.isPending) mutation.reset(); void query.refetch(); };
  const entries = [...new Map((query.data?.pages.flatMap(p => p.data.timeline) ?? []).map(entry => [entry.id, entry])).values()].sort((a, b) => a.version - b.version);
  const content = alert ? <article className="clinical-record"><h2>Alert {alert.patientName}</h2><p><strong>Status: {statusLabels[alert.status]}</strong></p><p>Prioritas sumber: F2 akut. {alert.source.reason}</p><p>Laporan: {visitTime(alert.source.reportedAt)}</p><p>Hasil F2 dicatat: {visitTime(alert.source.outcomeAt)}</p><Link href={`/monitoring/reports/${alert.source.reportId}`}>Buka laporan sumber</Link>
    {alert.acknowledgedAt && <p>Diakui perawat: {visitTime(alert.acknowledgedAt)}</p>}{alert.resolvedAt && <p>Proses ditutup: {visitTime(alert.resolvedAt)}. Penutupan ini tidak menyatakan pasien sembuh.</p>}
    <section className="clinical-section"><h2>Riwayat operasional</h2><ol>{entries.map(e => <li key={e.id}><p><strong>{statusLabels[e.status]}</strong>. Dicatat: {visitTime(e.recordedAt)}</p>{e.actorId && <p>Pencatat: {e.actorId}</p>}{e.actionType && <p>{actionTypeLabels[e.actionType]}. Waktu tindakan: {visitTime(e.occurredAt)}</p>}{e.internalNote && <p>Catatan internal: {e.internalNote}</p>}{e.patientSummary && <p>Dipublikasikan untuk pasien: {e.patientSummary}</p>}</li>)}</ol>{query.hasNextPage && <Button variant="outline" disabled={query.isFetching || mutation.isPending} onClick={() => { void query.fetchNextPage(); }}>Muat riwayat sebelumnya</Button>}</section>
    <div role="status" aria-live="polite">{mutation.isPending ? <p>Menyimpan tindakan...</p> : mutation.isSuccess ? <p>Tindakan tersimpan.</p> : mutationFailure ? <p>{mutationFailure.message}</p> : null}</div>{unknown && <Button disabled={mutation.isPending} onClick={mutation.reconcile}>Periksa tindakan yang sama</Button>}
    <AlertActionForms alert={alert} disabled={disabled} onSubmit={mutation.submit} followupRevision={followupRevision} /></article> : null;
  const state: PanelState = alert ? { kind: "content", content, refresh: query.isError ? { kind: "error", failure, onRetry: refresh } : query.isFetching ? { kind: "refreshing" } : { kind: "idle" } } : query.isError || denied ? { kind: "error", failure: denied && mutationFailure ? mutationFailure : failure, onRetry: refresh } : { kind: "loading" };
  return <><Link href="/escalations">Kembali ke antrean eskalasi</Link><h1>Detail eskalasi</h1><p>Status ini mencatat pekerjaan operasional. Jangan menunggu balasan aplikasi untuk mencari pertolongan darurat.</p><AsyncPanel state={state} /><Button variant="outline" disabled={query.isFetching || mutation.isPending} onClick={refresh}>Muat ulang alert</Button></>;
}
