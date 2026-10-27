"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AsyncPanel, type PanelState } from "@/components/states/async-panel";
import { ApiFailure } from "@/lib/api/client";
import { PatientSessionData, usePatientSession } from "@/features/patients/session-data";
import { overviewEnvelope } from "@/features/patients/contracts";
import { visitTime } from "@/features/homecare/contracts";
import { DraftForm } from "./draft-form";
import { draftEnvelope, draftMutation, reviewEnvelope, reviewMutation, reviewPage, reviewLabels, terminalReview, type Draft, type Review, type PlanIntent } from "./contracts";
const failure = (e: unknown) => e instanceof ApiFailure ? e : new ApiFailure("processing_failed");
const denied = (e: unknown) => e instanceof ApiFailure && ["unauthenticated", "forbidden", "not_found", "session_changed"].includes(e.code);
export function PlanWorkspacePage(props: { principalId: string; csrfToken: string; patientId: string; initialDraftId?: string; initialReviewId?: string }) { return <PatientSessionData key={`${props.principalId}:${props.csrfToken}:${props.patientId}`} {...props}><PlanWorkspace {...props} /></PatientSessionData>; }
function PlanWorkspace({ patientId, principalId, initialDraftId, initialReviewId }: { patientId: string; principalId: string; initialDraftId?: string; initialReviewId?: string }) {
  const session = usePatientSession(), router = useRouter(), [draftId, setDraftId] = useState(initialDraftId ?? ""), [reviewId, setReviewId] = useState(initialReviewId ?? "");
  const intent = useRef<(PlanIntent & { key: string }) | null>(null), sending = useRef(false);
  const overview = useQuery(session.options(["overview", patientId], `/v1/patients/${patientId}/overview`, overviewEnvelope));
  const list = useInfiniteQuery({ queryKey: session.key(["reviews", patientId]), initialPageParam: null as string | null, queryFn: async ({ pageParam, signal }) => { const response = await session.api.request(`/v1/reviews?patientId=${encodeURIComponent(patientId)}&limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { schema: reviewPage, signal }); if (response.data.some(r => r.patientId !== patientId)) throw new ApiFailure("invalid_response"); return response; }, getNextPageParam: p => p.nextCursor ?? undefined, refetchInterval: 5000 });
  const draft = useQuery({ ...session.options(["draft", draftId], `/v1/care-plan-drafts/${draftId}`, draftEnvelope), enabled: !!draftId });
  const review = useQuery({ ...session.options(["review", reviewId], `/v1/reviews/${reviewId}`, reviewEnvelope), enabled: !!reviewId, refetchInterval: q => q.state.data && terminalReview(q.state.data.data.state) ? false : 3000,
    structuralSharing: (oldValue, nextValue) => { const old = reviewEnvelope.safeParse(oldValue), next = reviewEnvelope.safeParse(nextValue); return old.success && next.success && old.data.data.version > next.data.data.version ? oldValue : nextValue; } });
  const live = !!reviewId && !terminalReview(review.data?.data.state ?? "") && !denied(review.error);
  // Polling is a read: a valid cached gate stays actionable while a background GET is in flight.
  // Only mutation uncertainty, access loss, or a failed/denied read with no trusted gate disables it.
  useEffect(() => {
    if (!live) return;
    const events = new EventSource(`/api/syncare/v1/reviews/${encodeURIComponent(reviewId)}/stream`);
    const refresh = () => { void session.query.invalidateQueries({ queryKey: session.key(["review", reviewId]), exact: true }); };
    for (const name of ["snapshot", "gate", "state", "result", "error"]) events.addEventListener(name, refresh);
    return () => events.close();
  }, [reviewId, session, live]);
  const open = (nextDraft: string, nextReview: string) => { setDraftId(nextDraft); setReviewId(nextReview); router.replace(`/patients/${patientId}/care-plan?${nextReview ? `reviewId=${encodeURIComponent(nextReview)}&` : ""}draftId=${encodeURIComponent(nextDraft)}`, { scroll: false }); };
  const mutation = useMutation({ mutationFn: async (value: PlanIntent) => {
    intent.current ??= { ...value, key: crypto.randomUUID() };
    const savedIntent = intent.current;
    if (savedIntent.path !== value.path || JSON.stringify(savedIntent.body) !== JSON.stringify(value.body)) throw new ApiFailure("outcome_unknown");
    if (value.kind === "draft") { const response = await session.api.request(value.path, { method: "POST", body: savedIntent.body, idempotencyKey: savedIntent.key, schema: draftMutation, timeoutMs: 70000 }); if (response.data.resource.patientId !== patientId) throw new ApiFailure("outcome_unknown"); return { kind: "draft" as const, value: response.data.resource }; }
    const response = await session.api.request(value.path, { method: "POST", body: savedIntent.body, idempotencyKey: savedIntent.key, schema: reviewMutation, timeoutMs: 70000 });
    if (response.data.resource.patientId !== patientId || (value.kind === "decision" && response.data.resource.id !== reviewId)) throw new ApiFailure("outcome_unknown");
    return { kind: "review" as const, value: response.data.resource };
  }, onSuccess: async result => {
    intent.current = null;
    await session.query.cancelQueries({ queryKey: session.key(["review"]) });
    await session.query.cancelQueries({ queryKey: session.key(["draft"]) });
    if (result.kind === "draft") { session.query.setQueryData(session.key(["draft", result.value.id]), { data: result.value, requestId: "committed-draft" }); open(result.value.id, ""); }
    else { session.query.setQueryData(session.key(["review", result.value.id]), { data: result.value, requestId: "committed-review" }); open(result.value.draftId, result.value.id); }
    await list.refetch();
  }, onError: error => { if (error instanceof ApiFailure && error.code !== "outcome_unknown") intent.current = null; if (error instanceof ApiFailure && error.code === "version_conflict") { void review.refetch(); void draft.refetch(); } }, onSettled: () => { sending.current = false; }, retry: false });
  const submit = (value: PlanIntent) => { if (sending.current) return; sending.current = true; mutation.mutate(value); };
  const unknown = mutation.isError && failure(mutation.error).code === "outcome_unknown", blocked = mutation.isPending || unknown;
  const accessLost = [overview.error, list.error, draft.error, review.error, mutation.error].some(denied);
  const context = accessLost ? undefined : overview.data?.data, currentDraft = accessLost ? undefined : draft.data?.data, currentReview = accessLost ? undefined : review.data?.data;
  const mismatch = context && (context.profile.id !== patientId || (currentDraft && currentDraft.patientId !== patientId) || (currentReview && currentReview.patientId !== patientId));
  const validContext = context && !mismatch;
  const existingReview = list.data?.pages.flatMap(p => p.data).find(r => r.draftId === draftId);
  const refresh = () => { void overview.refetch(); void list.refetch(); if (draftId) void draft.refetch(); if (reviewId) void review.refetch(); };
  const content = validContext ? <>
    <h1>Rencana perawatan {context.profile.profile.displayName}</h1><p>Draf F3 belum disetujui sampai keputusan manusia dan bukti penyimpanannya terverifikasi.</p>
    <DraftForm key={context.confirmedRisk.current?.assessmentId ?? "unconfirmed"} patientId={patientId} assessmentId={context.confirmedRisk.status === "confirmed" ? context.confirmedRisk.current?.assessmentId ?? null : null} disabled={blocked || overview.isFetching || overview.isError} submit={submit} />
    <section className="clinical-section"><h2>Review tersimpan</h2>{list.data?.pages.every(p => p.data.length === 0) && <p>Belum ada review tersimpan untuk pasien ini.</p>}<ul>{list.data?.pages.flatMap(p => p.data).map(r => <li key={r.id}><Button variant="outline" disabled={blocked} onClick={() => open(r.draftId, r.id)}>{reviewLabels[r.state]} · {visitTime(r.createdAt)}</Button></li>)}</ul>{list.hasNextPage && <Button variant="outline" disabled={blocked || list.isFetching} onClick={() => { void list.fetchNextPage(); }}>Muat review berikutnya</Button>}</section>
    {draftId && (currentDraft ? <DraftContent draft={currentDraft} disabled={blocked || draft.isFetching || draft.isError || !!reviewId || !!existingReview} submit={submit} /> : <AsyncPanel state={draft.isError ? { kind: "error", failure: failure(draft.error), onRetry: () => { void draft.refetch(); } } : { kind: "loading" }} />)}
    {!reviewId && existingReview && <Button variant="outline" disabled={blocked} onClick={() => open(existingReview.draftId, existingReview.id)}>Buka review draf ini yang tersimpan</Button>}
    {reviewId && (currentReview ? <ReviewContent key={currentReview.id} review={currentReview} actorId={principalId} disabled={blocked || review.isError} submit={submit} openRevision={id => open(id, "")} /> : <AsyncPanel state={review.isError ? { kind: "error", failure: failure(review.error), onRetry: () => { void review.refetch(); } } : { kind: "loading" }} />)}
    <div role="status" aria-live="polite">{mutation.isPending ? <p>Permintaan sedang disimpan...</p> : mutation.isError ? <p>{failure(mutation.error).message}</p> : mutation.isSuccess ? <p>Permintaan tersimpan. Status di bawah mengikuti bukti server.</p> : null}</div>
    {unknown && <Button disabled={mutation.isPending} onClick={() => { if (intent.current) submit(intent.current); }}>Periksa permintaan yang sama</Button>}
    <Button variant="outline" disabled={mutation.isPending} onClick={refresh}>Muat ulang rencana dan review</Button>
  </> : null;
  const error = [overview.error, list.error, draft.error, review.error, mutation.error].find(denied) ?? overview.error ?? list.error ?? (mismatch ? new ApiFailure("invalid_response") : undefined);
  const state: PanelState = validContext ? { kind: "content", content, refresh: overview.isError || list.isError ? { kind: "error", failure: failure(error), onRetry: refresh } : overview.isFetching ? { kind: "refreshing" } : { kind: "idle" } } : error ? { kind: "error", failure: failure(error), onRetry: refresh } : { kind: "loading" };
  return <><Link href={`/patients/${patientId}`}>Kembali ke profil pasien</Link><AsyncPanel state={state} /></>;
}
function DraftContent({ draft, disabled, submit }: { draft: Draft; disabled: boolean; submit: (v: PlanIntent) => void }) {
  return <section className="clinical-section clinical-record"><h2>Draf tersimpan</h2><p>Status draf: {draft.state}. Sumber F1: {draft.assessmentId}.</p>{draft.parentDraftId && <p>Revisi dari draf {draft.parentDraftId}.</p>}{draft.artifact ? <><p>{draft.artifact.plan_text}</p><p>Kategori dari sumber: {draft.artifact.tier}.</p><ul>{draft.artifact.care_intensity.map((v, i) => <li key={i}>{v}</li>)}</ul><p>{draft.artifact.disclaimer}</p><details><summary>Resource rencana dari F3</summary><pre className="stored-source">{JSON.stringify(draft.artifact.satuseshat, null, 2)}</pre></details><Button disabled={disabled || draft.state !== "DRAFT"} onClick={() => submit({ kind: "start", path: `/v1/care-plan-drafts/${draft.id}/reviews`, body: {} })}>Ajukan draf ini untuk review</Button></> : <p>Belum ada draf valid yang dapat diajukan. Periksa status sebelum membuat permintaan lain.</p>}</section>;
}
function ReviewContent({ review, actorId, disabled, submit, openRevision }: { review: Review; actorId: string; disabled: boolean; submit: (v: PlanIntent) => void; openRevision: (id: string) => void }) {
  const [note, setNote] = useState("");
  return <section className="clinical-section clinical-record"><h2>Review rencana</h2><p role="status"><strong>Status review: {reviewLabels[review.state]}</strong></p><p>Dicatat: {visitTime(review.updatedAt)}. Versi {review.version}.</p>
    {["START_UNKNOWN", "DECISION_UNKNOWN", "UNKNOWN"].includes(review.state) && <p>Hasil belum dapat dipastikan. Jangan mengirim ulang keputusan melalui permintaan baru. Muat status atau minta operator memeriksa bukti.</p>}
    {review.state === "APPROVED" && <p>Persetujuan dan audit kanonis sudah cocok. Rencana dapat dibaca oleh pasien yang bersangkutan.</p>}
    {review.state === "ESCALATED" && <p>Rencana perlu perhatian klinisi. Status ini tidak membuat alert darurat pasien dan tidak menyatakan bantuan telah dikirim.</p>}
    {review.state === "REVISION_DRAFT" && review.revisedDraftId && <Button disabled={disabled} onClick={() => openRevision(review.revisedDraftId!)}>Buka draf revisi</Button>}
    {review.decision && <p>Keputusan tercatat: {review.decision.actionId}. Pencatat: {review.decision.actorId}. {visitTime(review.decision.recordedAt)}.</p>}
    {review.state === "WAITING_FOR_HUMAN" && review.gate && <><p>Gate: {review.gate.requestId}. Pencatat keputusan: {actorId}.</p><label className="clinical-form">Catatan peninjau (opsional)<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={4000} disabled={disabled} /></label><div className="flex flex-wrap gap-3">{review.gate.options.map(o => <Button key={o.actionId} disabled={disabled} onClick={() => submit({ kind: "decision", path: `/v1/reviews/${review.id}/decisions`, body: { expectedVersion: review.version, requestId: review.gate!.requestId, actionId: o.actionId, ...(note ? { reviewerNote: note } : {}) } })}>Kirim keputusan {o.label}</Button>)}</div></>}
  </section>;
}
