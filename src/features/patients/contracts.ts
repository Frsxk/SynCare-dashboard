import { z } from "zod";
import { dataEnvelope, pageEnvelope } from "@/lib/api/contracts";
import { checkinSchema, outcomeSchema } from "@/features/monitoring/contracts";

export const patientSchema = z.object({ id: z.string(), profile: z.object({ displayName: z.string() }).strict(), recordedCondition: z.string().nullable(), version: z.number().int().positive(),
  createdAt: z.string(), updatedAt: z.string(), source: z.object({ actorId: z.string(), recordedAt: z.string() }).strict() }).strict();
export const dischargeSchema = z.object({ id: z.string(), patientId: z.string(), episodeId: z.string(), version: z.number(), sourceText: z.string().nullable(),
  createdAt: z.string(), actorId: z.string(), patientVersion: z.number() }).strict();
export const tierSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const riskEvidenceSchema = z.object({ id: z.string(), assessmentId: z.string(), dischargeId: z.string(), sourceVersion: z.number(), category: tierSchema,
  score: z.number(), confirmedBy: z.string(), confirmedAt: z.string(), applicable: z.boolean(), disclaimer: z.string(), label: z.string(), version: z.number() }).strict();
const factorSchema = z.object({ value: z.unknown(), threshold: z.unknown(), points: z.number(), met: z.boolean() }).passthrough();
const outputSchema = z.object({ score: z.number(), tier: tierSchema, episode: z.record(z.string(), z.unknown()), risk_factors: z.record(z.string(), factorSchema),
  rationale: z.string(), label: z.string(), missing_fields: z.array(z.string()), disclaimer: z.string(), not_clinically_validated: z.literal(true), synthetic_demo_only: z.literal(true) }).passthrough();
export const assessmentSchema = z.object({ id: z.string(), patientId: z.string(), dischargeId: z.string(), sourceVersion: z.number(), actorId: z.string(), version: z.number(),
  state: z.enum(["RUNNING", "SUCCEEDED", "INVALID", "FAILED", "UNKNOWN"]), createdAt: z.string(), completedAt: z.string().nullable(), output: outputSchema.nullable(), failureCode: z.string().nullable() }).strict();
const unavailable = z.object({ availability: z.literal("unavailable"), reason: z.literal("domain_source_not_connected") }).strict();
export const overviewSchema = z.object({ profile: patientSchema, currentDischarge: dischargeSchema.nullable(),
  confirmedRisk: z.object({ status: z.enum(["confirmed", "unconfirmed", "needs_reassessment"]), current: riskEvidenceSchema.nullable(), previous: riskEvidenceSchema.nullable() }).strict(),
  latestAssessment: assessmentSchema.nullable(), permissions: z.object({ managePatient: z.boolean(), reviewRisk: z.boolean(), provisionPatient: z.boolean(), manageAssignments: z.boolean() }).strict(),
  currentPlan: unavailable, latestReport: checkinSchema.nullable(), latestAnalysis: outcomeSchema.nullable(), activeBookingCounts: unavailable, openAlertCounts: unavailable }).strict().superRefine((v, ctx) => {
    if (v.latestReport && v.latestReport.patientId !== v.profile.id) ctx.addIssue({ code: "custom", message: "Invalid overview patient context" });
  });
export const patientPage = pageEnvelope(patientSchema);
export const overviewEnvelope = dataEnvelope(overviewSchema);
export const patientMutation = dataEnvelope(z.object({ resource: patientSchema, replayed: z.boolean() }).strict());
export const dischargeMutation = dataEnvelope(z.object({ resource: dischargeSchema, replayed: z.boolean() }).strict());
export const assessmentEnvelope = dataEnvelope(assessmentSchema);
export const confirmationMutation = dataEnvelope(z.object({ resource: riskEvidenceSchema, replayed: z.boolean() }).strict());
export const assessmentPage = pageEnvelope(assessmentSchema).extend({ confirmations: z.array(riskEvidenceSchema) });
export type Patient = z.infer<typeof patientSchema>;
export type Overview = z.infer<typeof overviewSchema>;
export type Assessment = z.infer<typeof assessmentSchema>;

export const profileFormSchema = z.object({ displayName: z.string().trim().min(1, "Isi nama pasien.").max(160), recordedCondition: z.string().max(4000) }).strict();
export type ProfileInput = z.infer<typeof profileFormSchema>;
