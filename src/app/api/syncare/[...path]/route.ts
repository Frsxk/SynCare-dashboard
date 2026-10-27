import { createGateway } from "@/lib/api/bff";
import { resolveNurseSession } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const relay = createGateway({
  resolveSession: resolveNurseSession,
  backendOrigin: () => process.env.SYNCARE_BACKEND_ORIGIN ?? "http://127.0.0.1:8080",
  webOrigin: () => process.env.SYNCARE_WEB_ORIGIN ?? "http://127.0.0.1:3000",
  allowLoopbackHttp: () => process.env.SYNCARE_ALLOW_LOCAL_HTTP === "true",
});

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return relay(request, (await context.params).path);
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };

