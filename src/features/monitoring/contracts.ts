import { z } from "zod";
import { dataEnvelope, pageEnvelope } from "@/lib/api/contracts";
const tier = z.enum(["LOW", "MEDIUM", "HIGH"]);
const routine = z.object({ action: z.enum(["continue_monitoring", "trigger_plan_review"]), patient_id: z.string(), baseline_score: z.number(), baseline_tier: tier,
  score: z.number(), tier, tier_changed: z.boolean(), next_checkin_days: z.number().int().positive(), label: z.string(), disclaimer: z.string(),
  adjustments: z.array(z.object({ condition: z.string(), applied: z.boolean(), points: z.number() })),
  extraction: z.object({ symptoms: z.array(z.string()), medication_adherence: z.enum(["regular", "irregular", "unknown"]), red_flag: z.literal(false), quote_of_red_flag: z.literal("") }) }).passthrough();
export const outcomeSchema = z.union([z.object({ action: z.literal("escalate_immediately"), reason: z.string().min(1) }).strict(), routine]);
export const checkinSchema = z.object({ id: z.string(), patientId: z.string(), message: z.string(), submittedBy: z.string(), createdAt: z.string().datetime(), version: z.number().int().positive(),
  baseline: z.object({ assessmentId: z.string(), confirmationId: z.string(), score: z.number(), dischargeId: z.string(), sourceVersion: z.number().int().positive(), applicable: z.boolean() }).strict().nullable(),
  processing: z.object({ id: z.string(), state: z.enum(["PENDING", "BLOCKED_BASELINE", "RUNNING", "SUCCEEDED", "INVALID", "FAILED", "UNKNOWN"]), version: z.number().int().positive(), updatedAt: z.string().datetime(), failureCode: z.string().nullable() }).strict(),
  outcome: outcomeSchema.nullable(), alertEvidence: z.enum(["not_applicable", "queued", "unavailable"]) }).strict().superRefine((r, ctx) => {
    if ((r.processing.state === "SUCCEEDED") !== (r.outcome !== null)) ctx.addIssue({ code: "custom", message: "Invalid processing evidence" });
    if (r.outcome && r.outcome.action !== "escalate_immediately" && (r.outcome.patient_id !== r.patientId || r.outcome.baseline_score !== r.baseline?.score)) ctx.addIssue({ code: "custom", message: "Invalid report context" });
  });
export const checkinEnvelope = dataEnvelope(checkinSchema);
export const checkinPage = pageEnvelope(checkinSchema);
export const monitoringPage = pageEnvelope(z.object({ id: z.string(), createdAt: z.string().datetime(), profile: z.object({ displayName: z.string() }).strict(), latestReport: checkinSchema.nullable() }).strict());
export const guidanceEnvelope = dataEnvelope(z.object({ content: z.string(), contacts: z.array(z.object({ label: z.string(), number: z.string(), action: z.literal("information_only") }).strict()), region: z.string(), verifiedAt: z.string().datetime(), source: z.string().url(), version: z.number().int().positive() }).strict());
export type CheckinRecord = z.infer<typeof checkinSchema>;
export const processingLabel: Record<CheckinRecord["processing"]["state"], string> = {
  PENDING: "Tersimpan, menunggu analisis", RUNNING: "Tersimpan, sedang dianalisis", BLOCKED_BASELINE: "Tersimpan, baseline F1 terkonfirmasi belum tersedia",
  SUCCEEDED: "Analisis selesai", INVALID: "Hasil analisis tidak valid", FAILED: "Analisis belum berhasil", UNKNOWN: "Hasil analisis belum dapat dipastikan",
};
