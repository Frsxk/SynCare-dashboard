import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiFailure } from "../api/client";
import type { FieldValues, UseFormSetError } from "react-hook-form";

function originalText(max: number) {
  return z.string().refine(value => value.trim().length > 0 && [...value].length <= max, "Periksa isian dan batas panjang teks.");
}
export const checkinFormSchema = z.object({ message: originalText(8000) }).strict();
export const dischargeFormSchema = z.object({ sourceText: originalText(64000) }).strict();
export const questionFormSchema = z.object({ query: originalText(2000) }).strict();
export const checkinResolver = zodResolver(checkinFormSchema);
export const dischargeResolver = zodResolver(dischargeFormSchema);
export const questionResolver = zodResolver(questionFormSchema);

export function formFailure(error: unknown): { message: string; action: "refetch" | "reconcile" | "sign-in" | "correct" | "retry" | "none" } {
  const failure = error instanceof ApiFailure ? error : new ApiFailure("processing_failed");
  const action = failure.code === "version_conflict" ? "refetch"
    : failure.code === "outcome_unknown" ? "reconcile"
    : failure.code === "unauthenticated" || failure.code === "session_changed" ? "sign-in"
    : failure.code === "validation_failed" ? "correct"
    : failure.retryable ? "retry" : "none";
  return { message: failure.message, action };
}

export function applyFormFailure<T extends FieldValues>(setError: UseFormSetError<T>, error: unknown) {
  const result = formFailure(error);
  setError("root.server", { type: "server", message: result.message });
  return result;
}
