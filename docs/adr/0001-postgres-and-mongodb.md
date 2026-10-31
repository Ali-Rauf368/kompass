# ADR 0001: PostgreSQL for business data, MongoDB for event-like data

**Status:** accepted

## Context

Kompass stores structured business records (employees, deals, tickets, invoices) that need relations,
constraints and reporting, as well as append-only, loosely structured data (audit events with varying
details, ticket activity feeds, notifications, raw integration payloads).

## Decision

- **PostgreSQL** (via Prisma) is the system of record for business data and hosts the analytics star schema.
- **MongoDB** (via Mongoose) holds audit events, notifications, ticket activity and raw NiFi payloads.
  TTL indexes implement retention periods automatically.

## Consequences

- Reporting joins happen only in PostgreSQL; nothing in MongoDB is needed for KPIs.
- GDPR erasure must touch both stores; `lib/gdpr.ts` does this in one place and is covered by tests.
- Two databases to operate and back up (`infra/backup/backup.sh` handles both).
