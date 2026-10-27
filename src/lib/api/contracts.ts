import { z } from "zod";

export const errorCodeSchema = z.enum([
  "unauthenticated", "forbidden", "not_found", "validation_failed", "version_conflict",
  "idempotency_conflict", "dependency_unavailable", "processing_failed", "outcome_unknown",
  "invalid_flow_output", "emergency_guidance_unavailable", "rate_limited", "booking_schedule_conflict",
]);
export const errorEnvelope = z.object({ error: z.object({
  code: errorCodeSchema, message: z.string(), requestId: z.string().min(1), retryable: z.boolean(),
  resourceId: z.string().optional(), currentVersion: z.number().int().positive().optional(),
}).strict() }).strict();

export function dataEnvelope<T extends z.ZodType>(data: T) {
  return z.object({ data, requestId: z.string().min(1) }).strict();
}
export function pageEnvelope<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), nextCursor: z.string().nullable(), requestId: z.string().min(1) }).strict();
}
export interface SessionScope { readonly principalId: string; readonly sessionGeneration: string }
export type ErrorCode = z.infer<typeof errorCodeSchema>;
