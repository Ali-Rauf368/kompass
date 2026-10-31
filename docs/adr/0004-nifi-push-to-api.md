# ADR 0004: NiFi pushes batches to an idempotent ingestion API

**Status:** accepted

## Context

ERP invoices arrive as nightly CSV exports; customer master data lives in an external CRM with a REST API.

## Decision

Apache NiFi handles transport, scheduling, format conversion and retries, then **POSTs JSON batches** to
`/api/ingest/:pipeline`. The API owns validation and business rules, upserts by natural key, and makes each
batch idempotent via `X-Batch-Id`. It answers 200 (all applied), 207 (partially applied) or 422 (all rejected)
so NiFi can route FlowFiles to success, retry or failure.

## Consequences

- Business rules stay in one tested codebase instead of being duplicated in NiFi processors.
- Re-running a NiFi flow is safe. Every run is visible on the Data pipelines page.
- Raw payloads are kept 30 days in MongoDB for debugging and replay.
