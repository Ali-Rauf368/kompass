# ADR 0002: Analytics as a star schema inside PostgreSQL

**Status:** accepted

## Context

The divisions want KPIs (win rate, SLA compliance, DSO, absence rate) across companies and over time.
Data volume is modest (tens of thousands of rows per year).

## Decision

A Kimball-style star schema in the `analytics` schema of the same PostgreSQL instance, rebuilt by a SQL ETL
(`apps/api/sql/analytics-refresh.sql`) after changes (debounced) and nightly. The employee dimension is
SCD type 2 so absence and sales history stay attributed to the department at the time. A materialised
view (`mv_kpi_monthly`) pre-aggregates monthly KPIs and is refreshed concurrently.

## Consequences

- No extra infrastructure; dashboards read a few hundred pre-aggregated rows.
- Full fact rebuilds are simple and correct at this scale. If volume grows by orders of magnitude, switch
  the facts to incremental loads keyed on `updatedAt`.
