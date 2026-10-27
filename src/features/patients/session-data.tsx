"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createSessionData } from "@/lib/query/client";

const Context = createContext<ReturnType<typeof createSessionData> | null>(null);
export function PatientSessionData({ principalId, csrfToken, children }: { principalId: string; csrfToken: string; children?: ReactNode }) {
  const [data] = useState(() => createSessionData({ principalId, sessionGeneration: csrfToken }, { csrfToken }));
  const mounts = useRef({ count: 0 });
  useEffect(() => {
    const lifetime = mounts.current;
    lifetime.count++;
    return () => {
      lifetime.count--;
      queueMicrotask(() => { if (lifetime.count === 0) data.dispose(); });
    };
  }, [data]);
  return <Context.Provider value={data}><QueryClientProvider client={data.query}>{children}</QueryClientProvider></Context.Provider>;
}
export function usePatientSession() {
  const context = useContext(Context);
  if (!context) throw new Error("patient_session_required");
  return context;
}
