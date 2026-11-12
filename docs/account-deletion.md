# Account deletion deployment and operation

The API stores a request, server timestamps, and a deadline exactly 240 hours
later. Pending requests remain cancellable before that deadline. Processing
requests cannot be cancelled. Only the verified account can request/cancel;
requesting requires its current password and explicit confirmation.

Endpoints below are relative to `/api/v1/users`:

- `GET /me/deletion`: pending/processing request, or `null`.
- `POST /me/deletion`: `{ "password": "…", "confirmation": "ELIMINAR MI CUENTA" }`.
- `DELETE /me/deletion`: cancel before the server deadline.

No production migrations, schedulers or permanent deletions were activated
during development. Deployment must apply `20261109030000_account_deletion.sql`
after its prerequisites and validate the actual FK inventory before enabling
the scheduler. Ordinary login does not depend on this migration.

## Supported cleanup and conservative safeguards

The cleanup transaction traverses the actual PostgreSQL foreign-key catalog.
Only explicitly recognized ownership edges can delete personal rows:
enrollments and their progress/results/reviews/certificates, personal profile,
notifications, sessions, verification applications, roles, simulated receipts,
subscriptions, organization memberships, inactive course assignments and own
audit entries. Unknown populated references abort and roll back every SQL
deletion, recording a retry rather than cascading into shared resources.

Organization creators of live spaces, the last active
organization administrator, active course instructors and the last general
administrator must resolve responsibility first. Shared actor references
(including content authors, moderators and role assigners) also fail closed
until transferred. Explicitly deleted inactive organizations keep their shared
history while detaching the deleted account's creator reference; active spaces
must retain a creator. No shared content deletion
is performed. These cases are intentionally not presented as completed
deletions. A processing account stays inaccessible while operators resolve a
retry; its personal rows are preserved on SQL failure.

Private files are accepted only when Storage owner matches the user, bucket is
private, path is `users/<user-id>/…`, and no `archivos` row references the path.
Shared `academix-course-content` files are never removed. The transaction saves
a durable manifest before user profile removal. The worker removes object bytes
using the Storage API, then deletes Auth credentials and refresh sessions. An
existing JWT cannot access the backend: processing profiles are inactive and
missing profiles are rejected. Cleanup completion is fenced by a lease token;
expired leases retry idempotent Storage/Auth operations. Metadata-only SQL
Storage deletes are never used.

Unlinked historical contact messages cannot safely be attributed by email
alone; they are excluded pending an explicit retention/identity policy.

## Persistent scheduling (activation required)

Build with `npm run build`. A one-shot bounded sweep is `npm run accounts:cleanup`.
This is a destructive operation against the configured database. Do not run it
against production for testing. Queue claims are bounded to 10, leases last 15
minutes, and retry backoff grows to a maximum of 24 hours.

On an always-on Windows server, after isolated and deployment validation:

```powershell
powershell -NoProfile -File scripts/install-account-cleanup-task.ps1 -ActivatePermanentDeletion
```

Run the installer from an administrator PowerShell on the server. The installed
task runs as the local SYSTEM service account every five minutes, including
when nobody is logged in, survives process restarts, starts
after missed runs and prevents overlapping invocations. The machine must be
running; use an always-on server for unattended service. The installer resolves
the Node executable and never embeds credentials. The backend
`.env` must remain readable only to administrators and its service account. Summary logs are stored
under `logs/account-cleanup`; configure normal host log rotation.

For Linux, use a persistent host cron entry, adapting the backend directory:

```cron
*/5 * * * * cd /srv/academix-backend && /usr/bin/node dist/scripts/cleanup-accounts.js >> /var/log/academix-account-cleanup.log 2>&1
```

Database leases make overlapping host invocations safe. No browser or Node.js
timer is responsible for deadlines. Supabase Cron can alternatively invoke a
deployed authenticated worker; no such deployment is silently created.

Operators can inspect `solicitudes_eliminacion_cuenta.status`, `attempts`,
`last_error_code`, `last_error_relation`, `next_attempt_at` and lease timestamps using an administrator
database connection. RPCs are restricted to the backend service role; queue
rows and private manifests are not exposed through the public data API.
Completed jobs clear their account identifier, private-file manifest and error
details; only anonymous execution timestamps and counters remain for diagnosis.

## Isolated verification

`tests/sql/account-deletion.integration.mjs` runs the actual migration in a fresh
PGlite database, replacing only its clock calls with an isolated controllable
clock. Configure `PGLITE_MODULE` to the local PGlite entrypoint; it never reads
the application's credentials. It verifies exact deadline equality, cancellation,
backend-only RPC privileges, deadline replay, lease replacement/fencing,
retry backoff and diagnostics, unknown-FK rollback, physical personal-row
removal, other-user/shared content preservation, durable private-file manifests
and archived-organization detachment. Runtime/route tests separately verify
fresh-client reauthentication, matching identity, explicit confirmation,
temporary-session cleanup, private Storage API use and hard Auth deletion.
