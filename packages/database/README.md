# PostgreSQL database

Apply migrations in filename order. Requests must set `SET LOCAL app.organisation_id = '<verified-tenant-uuid>'` inside every transaction so row-level security fails closed. Large media and consent documents live in private object storage; these tables store object keys, hashes and governance metadata only.

Published Persona versions are treated as immutable by services. Identity revocation is checked again when a session or render leaves the queue, preventing time-of-check/time-of-use reuse.

