// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useForm } from "react-hook-form";
import { AsyncPanel } from "@/components/states/async-panel";
import { ApiFailure } from "@/lib/api/client";
import { applyFormFailure, checkinResolver } from "@/lib/forms/contracts";

afterEach(cleanup);

test("retry, clear-filter and reconciliation controls execute their supplied recovery actions", () => {
  const retry = vi.fn();
  const clear = vi.fn();
  const reconcile = vi.fn();
  const view = render(createElement(AsyncPanel, { state: { kind: "error", failure: new ApiFailure("dependency_unavailable"), onRetry: retry } }));
  const button = screen.getByRole("button", { name: "Coba lagi" });
  button.focus();
  expect(document.activeElement).toBe(button);
  fireEvent.click(button);
  expect(retry).toHaveBeenCalledTimes(1);
  view.rerender(createElement(AsyncPanel, { state: { kind: "no-matches", onClear: clear } }));
  fireEvent.click(screen.getByRole("button", { name: "Hapus filter" }));
  expect(clear).toHaveBeenCalledTimes(1);
  view.rerender(createElement(AsyncPanel, { state: { kind: "error", failure: new ApiFailure("outcome_unknown"), onRetry: reconcile } }));
  fireEvent.click(screen.getByRole("button", { name: "Periksa status" }));
  expect(reconcile).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Coba lagi" })).toBeNull();
});

test("refresh keeps current content visible through loading/error and offers a working retry", () => {
  const retry = vi.fn();
  const view = render(createElement(AsyncPanel, { state: { kind: "content", content: "Existing synthetic report", refresh: { kind: "refreshing" } } }));
  expect(screen.getByText("Existing synthetic report")).toBeDefined();
  expect(screen.getByRole("status").textContent).toBe("Memperbarui data…");
  view.rerender(createElement(AsyncPanel, { state: { kind: "content", content: "Existing synthetic report", refresh: { kind: "error", failure: new ApiFailure("dependency_unavailable"), onRetry: retry } } }));
  expect(screen.getByText("Existing synthetic report")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("alert").textContent).toContain("Layanan belum tersedia");
});

test("RHF validation blocks blank input and preserves entered report after server uncertainty", async () => {
  const { result } = renderHook(() => {
    const form = useForm<{ message: string }>({ resolver: checkinResolver, defaultValues: { message: "" } });
    return { form, errors: form.formState.errors };
  });
  const submit = vi.fn();
  await act(async () => { await result.current.form.handleSubmit(submit)(); });
  expect(submit).not.toHaveBeenCalled();
  act(() => result.current.form.setValue("message", "  Synthetic report  "));
  await act(async () => { await result.current.form.handleSubmit(submit)(); });
  expect(submit).toHaveBeenCalledWith({ message: "  Synthetic report  " }, undefined);
  act(() => { applyFormFailure(result.current.form.setError, new ApiFailure("outcome_unknown")); });
  expect(result.current.form.getValues("message")).toBe("  Synthetic report  ");
  expect(result.current.errors.root?.server?.message).toContain("belum dapat dipastikan");
});
