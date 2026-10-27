import { QueryClient, queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import { ApiClient, type ClientDependencies } from "../api/client";
import type { SessionScope } from "../api/contracts";

export function createSessionData(scope: SessionScope, dependencies: ClientDependencies = {}) {
  if (!scope.principalId || !scope.sessionGeneration) throw new Error("authenticated_session_scope_required");
  const identity = Object.freeze({ ...scope });
  const api = new ApiClient(dependencies);
  // Each authenticated session owns an instance; never share a server-rendering singleton.
  const query = new QueryClient({ defaultOptions: {
    queries: { retry: 0, staleTime: 0, gcTime: 5 * 60 * 1000, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  } });
  const key = (parts: readonly unknown[]) => ["session", identity.principalId, identity.sessionGeneration, ...parts] as const;
  return {
    query, api, key,
    options<T>(parts: readonly unknown[], path: string, schema: z.ZodType<T>) {
      return queryOptions({ queryKey: key(parts), queryFn: ({ signal }) => api.request(path, { schema, signal }) });
    },
    dispose() {
      api.dispose();
      void query.cancelQueries();
      query.clear();
    },
  };
}
