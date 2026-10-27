# SynCare nurse dashboard

Current M11 closure2026-10-27: READY_LOCAL_BROWSER. [Report](../docs/planning/mvp-verification-report.md), [runbook](../docs/planning/demo-runbook.md).50 units/type/lint/optimized build and6 combined browser scenarios PASS. Nurse HttpOnly/CSRF stays; server-only helper decrypts protected env under current Windows user. Test fixture readers compatible with protected account JSON. Identifiers/passwords unchanged; scripts/show-local-accounts.ps1 in backend is the private copy helper. Patient tab-session strategy is separate and explicitly documented. No original-engine restart or deployment; other targets deferred. Older entries historical.

M11 current2026-10-27: [verification](../docs/planning/mvp-verification-report.md), [security](../docs/planning/security-verification.md), [accessibility](../docs/planning/ui-verification.md). Fresh50 units/type/lint PASS;3 actual browser security cases and2 keyboard/held-state/contrast/reflow cases PASS. Product source/build unchanged; nurse3000 retained, test server3101 separate. Both saved nurse accounts actually login200/session200. Copy matching credentials privately; Langflow does not verify passwords. M11 unconditional MVP NOT_READY with private at-rest handoff/patient web storage/Q10 recovery findings; nurse BFF cookie success does not close patient web storage. Earlier entries historical.

## Pre-M11 design refinement,2026-10-26

Owner palette green/navy/steel, active labeled icon navigation, real workspace task cards, grouped queues/forms/records and readable tables. Existing modules, session/CSRF and clinical/source contracts retained. Final50 units/type/lint/build PASS;9 bff/navigation scenarios plus1 new design regression pass across separate runs. The new test checks actual four-module content at320/390/768/1280 and100%/200% text; final production capture also passes32 combinations and keyboard task-card navigation. [Both-client design evidence](../docs/planning/SYNCARE-PRE-M11-DESIGN-VERIFICATION.md). Local3000/backend8080; M11 unstarted, no deployment. Older entries below are historical.

## Current M10 integration evidence,2026-10-26

M01-M09 accepted; M10 locally complete awaiting ACC, [report](../docs/planning/SYNCARE-M10-VERIFICATION.md). New tests/booking-escalation-e2e.spec.ts and tests/plan-qa-recovery-e2e.spec.ts use real patient API/Next nurse actions/backend/stores/Langflow. Saved original UUIDs/IDs in ignored M10 evidence make interrupted runs resume cases. Seven unique scenarios verified across separate runs; final50 unit/type/lint/build and production four-module/Completed/Resolved/review/context/logout320-text200/pageErrors0 PASS. Trace/credential logging disabled. Synthetic bookings/alerts/probes closed normally without old-data cleanup. Backend8080/nurse3000; native/deployed/whole-MVP unverified. M11 unauthorized before M10 ACC. Earlier status snapshots historical.

## Current local M09 behavior,2026-10-26

M01-M08 accepted; M09 locally complete awaiting ACC. Final T-1003 wiring covers four protected typed modules and patient/report/booking/alert/review details across direct URL, refresh, keyboard/back and account isolation. Existing feature links retained; mixed patient/review URL now shows typed invalid response and clears private source. Nurse Flutter not removed; M10 end-to-end acceptance remains separate.

[M09 report](../docs/planning/SYNCARE-M09-VERIFICATION.md): final type/lint/50 units/build PASS; targeted2, remaining regression25 PASS/1 navigation timeout and final keyboard1 PASS cover26 unique scenarios across separate runs. Final optimized production four-module/review/mismatch/logout320-text200/pageErrors0 PASS. Test condition waits increased for observed cold compilation; no product authentication change. Start `npm run start -- --port 3000`; backend8080 required.113-file final client scan PASS. Native/deployed/whole-MVP open, M10-M11 unauthorized; earlier status notes historical.

## Current local M08 behavior,2026-10-26

M01-M07 accepted; M08 locally complete awaiting ACC. Patient detail -> care-plan desk creates guarded F3 from current confirmed F1 and explicit date/contact, starts actual F4, discovers stored reviews and renders actual gate options. One original UUID per authenticated-memory mutation; close/reopen and unknown-decision reconciliation preserve evidence without automatic resend. Request Changes creates revisedDRAFT with explicit new gate; only verified canonical row+audit is approved. Denied refresh clears private sources. Escalated/fallback plan outcome never claims an acute alert/call/dispatch.

[M08 report](../docs/planning/SYNCARE-M08-VERIFICATION.md): final type/lint/50 units/10 files/optimized build PASS;25 unique current browser scenarios across separate runs, actual source/approval/lost-response and final production keyboard/refresh/foreign denial/logout/pageErrors0. Final111-file client scan PASS. Start built dashboard `npm run start -- --port 3000`; backend8080 and user Langflow required. [Recovery runbook](../docs/planning/recovery-runbook.md) states runtime expiry/retention limits. Parent/native/deployed/whole-MVP unverified, M09-M11 unauthorized. All earlier current-status paragraphs below are historical.

Current local implementation includes M02 accounts, M03 assigned patient/risk, M04 monitoring, M05-M06 homecare and M07 operational escalation. Next.js App Router, TypeScript, Tailwind and existing primitives retained. M01-M06 accepted; M07 locally complete awaiting ACC. M08-M11 and final native/deployed/whole-MVP gates remain open.

## Current local M07 behavior,2026-10-26

Eskalasi opens `/escalations`, default active/status-filtered queue, then `/escalations/[alertId]` for exact original F2 source/report, operational history and permitted actions. Current alert.manage/assignment required. Explicit Akui alert -> documented category/actual WIB time/internal note -> Tutup alert with closure summary; public summary fields are optional deliberate publication. No read acknowledgment/direct resolve/reopen. Status never claims recovery, successful contact or dispatch.

Unknown delivery retains original key/body;409 rereads without success. Future-time422 retains draft; successful follow-up alone resets it. Stale GET cannot rewind receipt; denied refresh clears private data. Type/lint/48 units/optimized build PASS. Actual targeted2 plus remaining regression23 cover24 unique browser scenarios across separate runs, including keyboard/narrow/text200/uncertainty/conflict/privacy. Actual production4-event closure/filter/foreign-denial/logout/pageErrors0 PASS. [M07 verification](../docs/planning/SYNCARE-M07-VERIFICATION.md) records exact limits; start existing build with `npm run start -- --port 3000`. Older milestone status notes below remain historical.

## Current local M06 behavior, 2026-10-26

Homecare defaults to Booking aktif; status/history filters query the server before pagination. Closed records remain accessible through their status or Semua booking. Assigned booking.manage nurses explicitly choose eligible staff and confirmed WIB times for Under Review, complete Scheduled via an explicit dialog with actual time/patient-visible note, or cancel/reject with a required public reason according to state. Preference and confirmed slot remain separate. No automatic staff choice, dispatch or recovered-patient claim.

All page actions share one retained original mutation intent. Unknown delivery locks action/payload/key until reconciliation; pending guards prevent double send.409 rereads, denied access clears content, and an old GET cannot rewind a newer receipt. Dialog Escape/focus/draft, keyboard navigation,320/text200 and768/1280 verified. Typecheck/lint,45 units,22 full browser tests plus final3 lifecycle checks, production build and actual production schedule/completion/filter/logout/foreign-denial smoke PASS. [M06 verification](../docs/planning/SYNCARE-M06-VERIFICATION.md). M06 awaits ACC; M07+ not authorized. Older notes below are historical.

## Current local M05 behavior, 2026-10-26

Homecare navigation opens `/homecare`; `/homecare/[bookingId]` shows assigned booking.manage patient name, immutable address/preference, actual state/version and audit timeline. Mulai review commits only Requested -> Under Review. Stale review409 refetches without success, lost committed response reconciles its original UUID, and denied detail removes private content. No scheduling/assignment/terminal action is exposed. Approved DKI Jakarta service is visibly simulation.

Final41 unit/full18 Edge browser plus final2 homecare tests, typecheck/lint/production build and actual production review/foreign404/logout/pageErrors0 PASS. See [M05 verification](../docs/planning/SYNCARE-M05-VERIFICATION.md). M05 awaits ACC; M06+ not started.

## Current local M04 behavior, 2026-10-25

Pemantauan opens `/monitoring` with assigned-only latest reports, keyboard-accessible history at `/monitoring/patients/[patientId]`, and persisted detail at `/monitoring/reports/[checkinId]`. Queries are session-scoped and bounded; source timestamps, numeric F1 baseline and original F2 outcome are rendered without scoring. Failed refresh retains permitted content; denied/not-found detail clears it.

Known urgent guidance precedes report metadata and also appears on the patient overview. Red semantic tokens match the existing Flutter high-risk palette; amber remains the demo notice. 119 is sourced information only, with no tel link or call. Queued alert work never implies received/dispatch. trigger_plan_review has its own indication and cannot replace confirmed F1. CP04 is authorized in DL-012; booking/escalation remain future modules. See [M04 verification](../docs/planning/SYNCARE-M04-VERIFICATION.md).

## M03 patient and risk baseline

`/patients` shows the actual assigned registry and authorized create form. `/patients/[patientId]` shows scoped overview, profile/source edits, stored-source disclosure, exact F1 factors/rationale, explicit same-category confirmation and historical applicability. A new source requires new F1 and confirmation. Conflicts refetch authoritative state and retain input; failed writes never fabricate success. Profile creation receipt does not claim assignment/activation. The operator still owns those decisions.

R02/CP03 is approved in DL-011. Session-local TanStack Query/API context is disposed on account changes. The default fetch receiver is bound to the browser global. Future domain sources/modules are explicitly unavailable. Final evidence: 36 unit/DOM and 14 Edge browser tests PASS, final actual-risk rerun PASS, lint/typecheck/build and production smoke PASS. See [M03 verification](../docs/planning/SYNCARE-M03-VERIFICATION.md). M03 awaits user ACC; no M04 work or deployment.

## Run and verify

Use Node >=20.9 (verified locally with Node 24.20.0). Dependencies are pinned in package.json/package-lock.json. These two gates are deliberately separate.

**Standalone application and unit gate (no backend sibling, private data or `.env.local`):**

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` uses portable synthetic fixtures. It does not read a backend checkout or the demo dataset, and it does not prove live backend interoperability.

**Private live browser integration (not part of the standalone gate):**

```powershell
npm run typecheck:integration
npm run test:e2e -- --workers=1
```

The legacy `.spec.ts` files and their `local-accounts.ts`, `homecare-scenarios.ts`, `alert-scenarios.ts` and `m10-fixtures.ts` helpers expect repositories cloned as siblings with the historical `SynCare-be` name and private fixture/evidence files under its `data/` directory. `npm run typecheck:integration` covers that complete tree and fails closed when the sibling source is absent instead of pretending to be a standalone pass. The private `data/*.json` fixtures are loaded through runtime `new URL(...)` paths, so `tsc` does not validate them; when they are missing, the live browser gate must be reported as NOT RUN, not PASS. Playwright uses installed Microsoft Edge on Windows; set `PLAYWRIGHT_CHANNEL` for another installed compatible channel. Browser tests use a temporary Next server on 3101 and require the real local backend on 8080 plus the privately provisioned account files. They start neither backend nor Langflow, do not mock authentication, and can append real demo bookings/alerts/reviews; never run them casually against accepted data. Auth traces are disabled. Report missing prerequisites as NOT RUN, not PASS.

`npm run dev` or the production `npm run start` binds 127.0.0.1:3000. `/login` exchanges credentials through a dedicated handler. `/workspace` redirects unverified/anonymous sessions to login; backend unavailability renders a retry state with data hidden. Copy `.env.example` to ignored `.env.local` and set `SYNCARE_BACKEND_ORIGIN`, `SYNCARE_WEB_ORIGIN`, `SYNCARE_ALLOW_LOCAL_HTTP` and a private random `SYNCARE_SESSION_SECRET` of at least 32 bytes. Generate the secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`; never commit, log or paste the real value. The server-only `src/lib/security/private-config.ts` adapter unwraps `dpapi:v1:` values under the same Windows CurrentUser scope/entropy as the backend, without importing a sibling source path. See the [account procedure](../docs/planning/demo-account-procedure.md).

## Security boundary

- The resolver opens an AES-GCM sealed HttpOnly cookie, then verifies the current session at Bun on each request. There is no role picker, hardcoded credential or development bypass. A cookie alone never supplies authority.
- The BFF allowlists method/path/query combinations, strips caller credentials, uses server-only session context, checks Origin + session-bound CSRF on unsafe requests, forwards idempotency/cursor headers, and disables response/fetch caching.
- Raw login grants never reach browser JavaScript through either handler. The dedicated exchange sets a host-only, SameSite=Lax cookie, Secure on HTTPS. Session-bound CSRF and exact Origin protect unsafe requests.
- Unit tests inject synthetic session and upstream fixtures. Passing those tests is not evidence that multiuser authentication or a live backend is implemented.
- SSE bodies stream without buffering. Transport failure/unknown mutation delivery does not mean an approval has expired or succeeded.
- Only M02 auth/registry/assignment producer routes are implemented so far. An allowlist entry for a future route does not mean that feature exists in Bun.
- Logout clears the cookie and revokes the current backend session. A persistent deny-only flag closes local access while offline and explicitly reports unconfirmed server revocation. BFCache/other-tab checks hide old content until the current identity is verified.

## Build choice and dependency note

Turbopack 16.4.3 failed on this Windows host with a PostCSS child-process IPC panic, both inside and outside the sandbox. Scripts use Next's supported Webpack mode; no TypeScript/build check is disabled. See [Next CLI](https://nextjs.org/docs/app/api-reference/cli/next).

Resolver 6.0.0 caused an optional Effect peer conflict. The lockfile uses @hookform/resolvers 5.2.2 with react-hook-form 7, which satisfies its verified peer contract. ESLint 9 is retained because the installed Next React lint plugin declares support through 9.7; its upstream support warning is recorded in the development log. No --force or --legacy-peer-deps is used.

Visual baseline follows DESIGN.md: clinical teal, amber synthetic notice, native system sans, light theme, low motion and no invented patient rows/statistics. Current evidence is in [M02 verification](../docs/planning/SYNCARE-M02-VERIFICATION.md).

## Session-scoped data foundation (T-1002)

`createSessionData({principalId, sessionGeneration}, {csrfToken})` constructs an independent in-memory QueryClient and ApiClient. Pass the backend-validated principal and an opaque per-session generation from the real M02 session boundary; this factory does not authenticate users or authorize patient IDs. There is no global SSR client or browser-persisted token/cache. On logout, expiry or account switch, dispose the old instance before using a new one; disposal aborts transport, cancels queries, clears cache and discards the CSRF token. Never reuse a disposed instance.

Use `layer.options([domain, patientId, filters, cursor], path, responseSchema)` for queries. Keys include principal and session generation. Both query and mutation default retry are zero; reads can be retried explicitly. Clinical/status mutations must have no optimistic success and no automatic replay. Forms retain input on failures. A version conflict requires a fresh read; an unknown outcome requires reconciliation before a new intent.

ApiClient accepts only same-origin /v1 paths through /api/syncare, whitelisted query names, cookie credentials and session-bound CSRF for writes. Callers supply one UUID idempotency key per intent. Zod validates response envelopes and structural form input; unexpected/malformed mutation results become outcome_unknown, never a fabricated resource. Raw upstream messages are not displayed. Approved empty 204 responses require an explicit undefined schema. No direct Langflow request or bearer storage exists here.

`AsyncPanel` uses one tagged state for loading/empty/no-matches/error/content; content remains visible during refresh failure. Supply real recovery callbacks. Its error action must read/reconcile or restore a session, never blindly repeat a mutation. `applyFormFailure` sets a RHF root error without clearing the user's values. None of these helpers exposes a new clinical feature or bypasses the production session resolver.

Unit/DOM tests cover late-session responses, stale refresh, bounded forms, risk and report recovery controls. Browser tests exercise actual nurse sessions, patient scopes, CSRF/Origin rejection, cookie replay, logout and narrow large-text login, plus actual registry, risk and monitoring workflows. CP03/CP04 mount independent session-local QueryClients; no global patient cache. Booking/escalation remain later work.

`TableViewport` provides a labelled, keyboard-focusable scroll region around a semantic table. Supply a descriptive `label` and keep the table caption/column headers in the child table. Wide content scrolls within the region rather than expanding the page. The shell's skip link moves focus to the main content. Neither component authenticates users or exposes an unfinished module.

M01 verification on 2026-10-25: 30 unit/DOM tests and seven Edge browser tests passed; lint, typecheck and production build passed. The shell/table fixture was checked at 320, 768 and 1200 pixels with 100% and 200% root text. Fixture screenshots are generated under the ignored `test-results/` directory. See [M01 verification](../docs/planning/SYNCARE-M01-VERIFICATION.md) for the acceptance mapping and remaining environment limitations.
