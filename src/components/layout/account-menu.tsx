"use client";

import { useEffect, useId, useRef, useState, type FocusEvent } from "react";
import { ChevronDown } from "lucide-react";
import { LogoutButton } from "../auth/session-controls";

const CLOSE_DELAY_MS = 200;

export function AccountMenu({ displayName, principalId, csrfToken }:
  { displayName: string; principalId?: string; csrfToken: string }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerInitiatedRef = useRef(false);
  const hoverOpenedRef = useRef(false);
  const suppressFocusOpenRef = useRef(false);

  const cancelScheduledClose = () => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const showMenu = () => {
    cancelScheduledClose();
    setOpen(true);
  };
  const scheduleClose = () => {
    cancelScheduledClose();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, CLOSE_DELAY_MS);
  };

  useEffect(() => cancelScheduledClose, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const focusWasInside = rootRef.current?.contains(document.activeElement) ?? false;
      setOpen(false);
      if (focusWasInside && document.activeElement !== triggerRef.current) {
        suppressFocusOpenRef.current = true;
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !event.currentTarget.contains(next)) setOpen(false);
  };

  return <div ref={rootRef} className="relative max-w-full" onPointerEnter={(event) => { if (event.pointerType !== "touch") { hoverOpenedRef.current = true; showMenu(); } }} onPointerLeave={(event) => { if (event.pointerType !== "touch") scheduleClose(); }} onBlur={handleBlur}>
    <button ref={triggerRef} type="button" aria-expanded={open} aria-controls={menuId}
      className="flex min-h-12 max-w-full items-center justify-end gap-2 rounded-xl px-2 py-1 text-left text-foreground transition-colors hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      onPointerDown={() => { pointerInitiatedRef.current = true; }}
      onPointerUp={() => { pointerInitiatedRef.current = false; }}
      onFocus={() => {
        if (suppressFocusOpenRef.current) { suppressFocusOpenRef.current = false; return; }
        if (!pointerInitiatedRef.current) showMenu();
      }}
      onClick={() => { pointerInitiatedRef.current = false; if (hoverOpenedRef.current) { hoverOpenedRef.current = false; showMenu(); } else setOpen((value) => !value); }}
      onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); showMenu(); } }}>
      <span className="grid min-w-0 gap-0.5 text-sm">
        <span className="text-[var(--muted-foreground)]">Akun aktif</span>
        <strong className="break-words font-medium">{displayName}</strong>
      </span>
      <ChevronDown size={18} aria-hidden="true" className={open ? "rotate-180 transition-transform" : "transition-transform"} />
    </button>
    {open && <div id={menuId} role="group" aria-label="Menu akun" className="absolute right-0 top-full z-30 pt-2"
      style={{ width: "18rem", maxWidth: "calc(100vw - 2rem)" }}
      onPointerEnter={(event) => { if (event.pointerType !== "touch") cancelScheduledClose(); }} onPointerLeave={(event) => { if (event.pointerType !== "touch") scheduleClose(); }}>
      <div className="rounded-xl border border-[var(--divider)] bg-[var(--card)] p-4 shadow-lg">
        <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">ID akun</span>
        <span className="mb-3 block break-words text-sm font-semibold">{principalId ?? displayName}</span>
        <LogoutButton csrfToken={csrfToken} />
      </div>
    </div>}
  </div>;
}
