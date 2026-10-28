# SynCare nurse dashboard

SynCare is a post-discharge follow-up service for CHF patients in Indonesian hospitals. This repository is the nurse-facing dashboard: a Next.js App Router application used by assigned nurses to review their patients, monitor home check-in reports, coordinate homecare visits, and act on clinical escalations.

The interface is in Indonesian. Clinical records, authorization decisions, and audit history live in the SynCare backend. The dashboard reaches them through a server-side Backend-for-Frontend (BFF), so browser JavaScript never receives a backend session token or a shared API key.

## Features

### Sign-in and session

- Credential login at `/login`. A dedicated server handler exchanges the nurse's identifier and password with the backend; the raw session grant stays on the server.
- The browser holds a sealed, HttpOnly session cookie plus a non-sensitive sign-out flag. Every protected page and every BFF request re-verifies the session with the backend before using it.
- Backend sessions are valid for at most 24 hours and are not extended by dashboard activity. The cookie expires with the backend grant.
- Logout revokes the backend session, clears the cookie, and notifies other open tabs through a `BroadcastChannel` so they hide patient content. If revocation cannot be confirmed, local access is still denied and the login page says the server revocation is unconfirmed.
- Returning through the back/forward cache or refocusing a tab re-checks the session and hides patient content until the current identity is verified.

### Workspace

`/workspace` is the signed-in landing page: task cards for the four clinical modules, the active account identifier, and a logout control.

### Patients and care plans

- `/patients` lists only patients assigned to the signed-in nurse, with cursor pagination. Nurses holding `patient.manage` can create a patient profile.
- `/patients/[patientId]` shows the current discharge source, the confirmed risk category (F1) with its factors and rationale, assessment history, the latest report, and permission-gated profile and risk controls.
- Recording a new discharge source requires a new assessment and an explicit confirmation. A source change never silently reuses an old confirmation; earlier evidence remains as history.
- `/patients/[patientId]/care-plan` is the care-plan desk. It creates a guarded draft from the current confirmed assessment plus an explicit follow-up date and routine contact, starts the review, lists stored drafts and reviews, and exposes the human approval gate. Gate decisions are recorded against the current review version; a revision outcome opens a new draft with its own gate.
- Plan review text is produced by the backend's Langflow plan-review pipeline (F3 draft, F4 review). The dashboard displays the stored artifact and gate options and never invents a plan locally.

### Monitoring

- `/monitoring` lists the latest check-in report for each assigned patient, with status, timing, and processing outcome.
- `/monitoring/patients/[patientId]` shows that patient's report history. `/monitoring/reports/[checkinId]` shows one stored report: processing state, the original F1 baseline, the F2 outcome, and any adjustment details.
- An urgent F2 outcome renders an urgent notice before the report metadata, with emergency guidance from the backend. The guidance is informational only; the dashboard does not place calls or dispatch help, and queued alert work is never presented as delivered assistance.
- A report whose F1 baseline is missing is shown as stored but not analyzed rather than being scored with a default.

### Homecare

- `/homecare` is the booking queue for assigned patients, filterable by active/all/single status, with server-side pagination.
- `/homecare/[bookingId]` shows the patient's immutable address and preferred window, the current booking state and version, and the full audit timeline.
- Permitted actions follow the booking state: start review (`Requested` → `Under Review`), schedule with an eligible staff member and a confirmed WIB window, complete with the actual completion time and a patient-visible note, or cancel/reject with a required patient-visible reason.
- The homecare catalogue is an explicitly synthetic DKI Jakarta service. The dashboard makes no availability, dispatch, or payment claim, and a preferred window is never shown as a confirmed schedule until a nurse chooses staff and time.

### Escalations

- `/escalations` is the operational alert queue, filtered by status.
- `/escalations/[alertId]` shows the original F2 acute report, urgency, current status, and append-only operational history.
- Nurses can acknowledge an alert, record a follow-up (category, actual WIB time, internal note, optional patient-visible summary), and close it with a closure summary. The optional summary fields are deliberate publication to the patient.
- The dashboard never claims that a patient was reached, that help was dispatched, or that a case is clinically resolved.

### Accessibility and layout

- Skip link to the main content, labeled navigation, semantic headings and tables, and `role="alert"`/`role="status"` for asynchronous states.
- Wide tables sit in labeled, keyboard-focusable scroll regions instead of widening the page.
- The completion form uses a native modal `<dialog>`; Escape closes it unless a submission is pending.
- Layouts are designed for narrow screens (down to 320 px) and 200% text zoom. `prefers-reduced-motion` disables transitions and animations.

## Architecture

- Next.js 16 App Router with React 19 and strict TypeScript.
- Tailwind CSS 4 for styling; Radix Slot, class-variance-authority, and lucide-react for primitives and icons.
- TanStack Query for client data, TanStack Table for tabular views, React Hook Form with Zod for forms and contracts.
- No global patient cache and no browser-persisted clinical data. Each protected client subtree creates a session-scoped QueryClient/ApiClient keyed by principal and session generation; it is disposed on logout, account change, or unmount, aborting transport and clearing cached data.

### Request flow

1. `POST /api/auth/login` validates the request origin and JSON body, calls the backend login endpoint, rejects non-nurse grants, and sets the sealed session cookie.
2. Server components call `resolveNurseSession()`, which opens the cookie and asks the backend `GET /api/v1/auth/session` for the current principal and expiry.
3. Client features call `/api/syncare/v1/...`. The BFF re-resolves the session, enforces its route allowlist, Origin and CSRF checks, then forwards to `${SYNCARE_BACKEND_ORIGIN}/api/v1/...` with the server-held bearer token.
4. Clinical mutations carry one UUID `Idempotency-Key` per user intent. Version conflicts require a fresh read; an unknown delivery outcome is surfaced as `outcome_unknown` and must be reconciled before retrying.

### Routes

| Route | Access | Purpose |
| --- | --- | --- |
| `/` | Public | Product introduction and link to sign-in |
| `/login` | Public | Nurse credential form |
| `/workspace` | Nurse session | Module landing page |
| `/patients`, `/patients/[patientId]` | Nurse session | Assigned registry, profile, discharge source, risk confirmation |
| `/patients/[patientId]/care-plan` | Nurse session | Care-plan draft and review desk |
| `/monitoring`, `/monitoring/patients/[patientId]`, `/monitoring/reports/[checkinId]` | Nurse session | Report queue, patient history, report detail |
| `/homecare`, `/homecare/[bookingId]` | Nurse session | Booking queue and booking actions |
| `/escalations`, `/escalations/[alertId]` | Nurse session | Alert queue and operational follow-up |
| `POST /api/auth/login` | Same-origin | Credential exchange and cookie issue |
| `GET`, `DELETE /api/auth/session` | Same-origin | Session snapshot / logout and revocation |
| `GET`, `POST`, `PATCH`, `DELETE /api/syncare/[...path]` | Nurse session | Allowlisted backend gateway |

## Requirements

- Node.js 20.9 or newer and npm. Use `npm ci` to install the versions pinned in `package-lock.json`.
- A reachable SynCare backend exposing `/api/v1` (default `http://127.0.0.1:8080`), with accounts, patient assignments, and capabilities already provisioned. The dashboard never seeds data or creates accounts.
- For care-plan review, the backend's Langflow integration must be running; the dashboard does not start or configure it.
- For browser tests only: a Playwright browser plus private backend fixtures (see [Testing](#testing)).

## Setup

```bash
npm ci
cp .env.example .env.local
```

On PowerShell use `Copy-Item .env.example .env.local`.

Edit `.env.local`:

| Variable | Required | Meaning |
| --- | --- | --- |
| `SYNCARE_BACKEND_ORIGIN` | Yes | Absolute backend origin, for example `http://127.0.0.1:8080`. No path, query, credentials, or fragment. |
| `SYNCARE_WEB_ORIGIN` | Yes | Exact origin users load the dashboard from, for example `http://127.0.0.1:3000`. Used for Origin checks and to decide the cookie's `Secure` flag. |
| `SYNCARE_SESSION_SECRET` | Yes | At least 32 bytes of private random material. Seals the session cookie and derives CSRF tokens. |
| `SYNCARE_ALLOW_LOCAL_HTTP` | No | Set to `true` to permit `http://` for loopback hosts only (`localhost`, `127.0.0.1`, `[::1]`). Any other host requires HTTPS. |
| `SYNCARE_PRIVATE_KEY_FILE` | Linux, when using `aesgcm:v1:` values | Absolute path to a separately provisioned raw 32-byte AES-256-GCM key file. |

Generate a secret locally and paste it only into the ignored `.env.local`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Never commit, log, or share the value. `.env*` is git-ignored except `.env.example`.

Run the app:

```bash
npm run dev                    # development server on http://127.0.0.1:3000
npm run build                  # production build
npm run start -- --port 3000   # serve the production build
```

Both `dev` and `start` bind `127.0.0.1` explicitly. Production deployments normally sit behind a TLS-terminating reverse proxy on the same host rather than exposing the Next server directly. Set `SYNCARE_WEB_ORIGIN` to the public HTTPS origin in that case so Origin validation and the cookie's `Secure` flag match reality. The Next config emits `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`, and `Cache-Control: private, no-store` for `/workspace`; add CSP and HSTS at the proxy.

## Private configuration on Windows and Linux

Sensitive environment values may be supplied in three forms:

| Form | Platform | Handling |
| --- | --- | --- |
| Plain text | Any | Used as-is. Acceptable only from a protected process environment. |
| `dpapi:v1:<base64>` | Windows | Decrypted with Windows DPAPI, `CurrentUser` scope, application entropy `SynCare.local.private.v1`. |
| `aesgcm:v1:<base64>` | Linux | Decrypted with AES-256-GCM using the key named by `SYNCARE_PRIVATE_KEY_FILE`. |

The server-only adapter in `src/lib/security/private-config.ts` unwraps any environment value carrying one of those prefixes when the auth configuration is loaded. Invalid or unsupported envelope versions fail closed with a code such as `invalid_private_envelope`; the underlying value is never included in the error.

Linux key-file rules are enforced on open: absolute path, regular file, owned by the current user, mode `0600`, exactly one hard link, no symlink, exactly 32 bytes. The adapter opens with `O_NOFOLLOW`, reads the key, and never creates, repairs, or generates it. AES-GCM envelopes are `iv[12] || tag[16] || ciphertext`, authenticated with the additional data `SynCare.local.private.v1:aesgcm:v1`.

Platform rules are strict:

- `dpapi:v1:` values are rejected on Linux (`windows_protection_required`).
- `aesgcm:v1:` values are rejected on Windows (`unsupported_private_envelope`).
- DPAPI decryption uses the account that runs the process. Provision and run the dashboard under the same Windows account; a service account change makes earlier ciphertext unreadable.
- Do not copy protected values between platforms or between accounts. Re-provision the secret natively on each host.

## Security model

- **Sealed session cookie.** `syncare_session` contains the backend session token and expiry, encrypted with AES-256-GCM under a key derived from `SYNCARE_SESSION_SECRET`, with the cookie name as additional authenticated data. It is `HttpOnly`, `SameSite=Lax`, host-only, `Path=/`, `Secure` when the web origin is HTTPS, and expires with the backend grant. A forged or truncated cookie fails authentication.
- **Server-verified authority.** A cookie alone grants nothing. `resolveNurseSession()` calls the backend session endpoint on every protected render/request, requires a `nurse` principal, and rejects expired or non-nurse sessions. There is no role picker, hardcoded credential, or development bypass.
- **CSRF.** Unsafe requests must carry the session-bound CSRF token: `HMAC-SHA256(secret-derived key, "csrf:" + sessionToken)`, compared in constant time. The token is issued to same-origin client code by `GET /api/auth/session`; it is not the backend token.
- **Origin checks.** Login, logout, and every unsafe gateway request require an exact `Origin` match against `SYNCARE_WEB_ORIGIN`.
- **BFF allowlist.** The gateway accepts only enumerated method/path combinations covering auth session exchange, patient registry/profile/assignment/discharge/questions, assessments and confirmations, check-ins and monitoring, emergency guidance, homecare services/staff/bookings/transitions, alerts/actions, and care-plan draft reviews, streams, and decisions. Unknown paths return 404 and disallowed methods 405.
- **Input limits.** Path segments are restricted to a safe character set, only `cursor`, `limit`, `patientId`, and `status` query keys are accepted (query string capped at 4096 characters), request bodies must be JSON objects under 256 KiB, and non-auth mutations require a valid UUID `Idempotency-Key`.
- **No credential passthrough.** The BFF builds fresh upstream headers, strips caller credentials, and never forwards cookies or an incoming `Authorization` header. Responses are `private, no-store`, `Vary: Cookie`, and carry an `X-Request-Id`.
- **Transport discipline.** Upstream redirects are not followed (3xx becomes 503), non-JSON/non-SSE success bodies are rejected, and upstream calls time out (180 seconds for the gateway, 10 seconds for session verification). SSE responses stream through unbuffered.
- **Logout and local denial.** Logout revokes the backend session and sets a 24-hour deny-only `syncare_signed_out` flag. If the backend is unreachable, the flag still closes local access and the UI explicitly reports that server revocation is unconfirmed. Other tabs are notified, and content is re-hidden on back/forward navigation or tab refocus until identity is re-verified.
- **No browser persistence of clinical data.** The dashboard uses no `localStorage`, `sessionStorage`, or IndexedDB for patient data; query caches are in memory and disposed with the session.

### Boundaries and non-goals

- The dashboard is a client and BFF, not the authorization authority. The backend re-checks capabilities, assignments, versions, and state transitions on every call. Hiding a control in the UI is usability, not enforcement.
- There is no MFA in this client. A backend `429` is surfaced as `rate_limited`; this is not a guarantee of rate limiting on clinical routes. Account quotas, traffic limits, and LLM-spend controls must be provided by the backend/deployment.
- The CSRF token is intentionally readable by same-origin JavaScript, so an XSS foothold would defeat CSRF protection. The app renders no raw HTML and relies on React escaping; add a deployment CSP at the proxy.
- The dashboard keeps no durable session store of its own. If the backend is unavailable, patient data stays hidden and the UI shows a retry state rather than stale content.
- The app does not set CSP or HSTS itself; those belong to the deployment proxy.

## Testing

### Standalone gates

These commands need no backend checkout, private data, or `.env.local`:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

- `npm test` runs Vitest over `tests/**/*.test.ts` in a Node environment with `server-only` stubbed. It covers contracts, the BFF, cookie/CSRF handling, both private-config platform paths, forms, and asynchronous UI states using synthetic fixtures. Passing it does not prove live backend interoperability.
- `npm run build` compiles the production bundle with webpack (`next build --webpack`). The npm scripts select webpack explicitly for both dev and build.

### Private browser integration

The Playwright suite under `tests/**/*.spec.ts` exercises real nurse sessions, CSRF/Origin rejection, cookie replay, logout, patient scopes, and the four clinical modules against a live backend. It is not part of the standalone gate.

```bash
npx playwright install chromium      # Linux/macOS; Windows defaults to installed Edge
npm run typecheck:integration
npm run test:e2e
```

Prerequisites:

- A prepared SynCare backend on `http://127.0.0.1:8080` with demo accounts, assignments, and capabilities.
- The backend checkout available as a sibling directory named `SynCare-be` next to this repository. The fixture helpers resolve imports such as `../../SynCare-be/src/security/private-files.cjs` and private JSON files under `../../SynCare-be/data/` (relative to `tests/`); a checkout with another directory name will fail module resolution.
- Private account, manifest, scenario, and evidence files under that ignored `data/` directory, produced by the backend's operator provisioning scripts. They are never committed.
- `.env.local` with a valid `SYNCARE_SESSION_SECRET`; Playwright starts its own dev server on `127.0.0.1:3101` and overrides `SYNCARE_WEB_ORIGIN` for that server.

Notes:

- `npm run typecheck:integration` compiles the complete source and test tree, including specs that depend on the backend sibling. It fails closed when those sources or fixtures are absent; do not report it as a standalone pass.
- The suite starts neither the backend nor Langflow. Missing prerequisites mean **NOT RUN**, not PASS.
- Tests create real bookings, alerts, and reviews and write evidence files under the backend `data/` directory. Run them only against a disposable demo dataset, never against accepted data.
- Playwright runs with one worker. On Windows it uses the installed Microsoft Edge channel by default; set `PLAYWRIGHT_CHANNEL` to use another installed channel.

## Project layout

```text
src/app/                 App Router pages, protected layout, and API handlers
src/app/api/auth/        Login and session/logout handlers
src/app/api/syncare/     Allowlisted backend gateway
src/features/            Patients, monitoring, homecare, escalations, plans, risk
src/components/          Shell, navigation, auth controls, UI primitives, states
src/lib/api/             BFF gateway, typed API client, shared envelopes
src/lib/auth/            Cookie sealing, session resolution, login/logout handlers
src/lib/query/           Session-scoped QueryClient/ApiClient factory
src/lib/security/        Windows DPAPI / Linux AES-GCM private-config adapter
tests/                   Vitest unit/DOM tests and Playwright browser specs
```

## Limitations

- This is a demonstration build, not a certified clinical product. Risk output is explicitly marked `not_clinically_validated` and `synthetic_demo_only`; care-plan artifacts carry a demo label and disclaimer and require human approval. Neither is medical advice.
- The homecare catalogue is a simulation limited to DKI Jakarta. There is no real availability, dispatch, or payment.
- Emergency guidance is informational. The dashboard does not call emergency services, page clinicians, or confirm that anyone received an alert.
- Protected configuration is supported on Windows (DPAPI) and on Linux/POSIX hosts where the AES-GCM key-file ownership and mode rules can be satisfied. The Linux path is the one verified by the checked-in tests.
- The dashboard targets a single backend origin per deployment; it is not multi-tenant.
- Browser coverage is Chromium/Edge. Other evergreen browsers are expected to work but are not exercised by the checked-in suite.
