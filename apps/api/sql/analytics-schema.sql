-- Kompass analytics warehouse: a Kimball-style star schema in its own Postgres schema.
-- Facts are rebuilt from the operational tables by analytics-refresh.sql; dimensions are merged.
-- Idempotent: safe to run on every deploy.

CREATE SCHEMA IF NOT EXISTS analytics;

-- ── Dimensions ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analytics.dim_date (
  date_key     integer PRIMARY KEY,          -- yyyymmdd
  full_date    date    NOT NULL UNIQUE,
  year         smallint NOT NULL,
  quarter      smallint NOT NULL,
  month        smallint NOT NULL,
  month_start  date     NOT NULL,
  iso_week     smallint NOT NULL,
  day_of_week  smallint NOT NULL,            -- 1 = Monday
  is_weekend   boolean  NOT NULL
);

INSERT INTO analytics.dim_date
SELECT to_char(d, 'YYYYMMDD')::int, d::date, extract(year FROM d), extract(quarter FROM d), extract(month FROM d),
       date_trunc('month', d)::date, extract(week FROM d), extract(isodow FROM d), extract(isodow FROM d) IN (6, 7)
FROM generate_series('2018-01-01'::date, '2032-12-31'::date, interval '1 day') AS d
ON CONFLICT (date_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS analytics.dim_company (
  company_key  integer PRIMARY KEY,          -- = operational Company.id (stable, no history needed)
  code         text NOT NULL,
  name         text NOT NULL,
  city         text NOT NULL
);

-- SCD type 1: customers are overwritten in place (we only report on current segment/city).
CREATE TABLE IF NOT EXISTS analytics.dim_customer (
  customer_key serial PRIMARY KEY,
  customer_id  integer NOT NULL UNIQUE,
  number       text NOT NULL,
  name         text NOT NULL,
  segment      text NOT NULL,
  city         text NOT NULL,
  postal_area  text NOT NULL                 -- first two digits of the postcode: coarse enough for reporting
);

-- SCD type 2: a new row whenever department, company or job title changes, so historical facts
-- stay attributed to the department the person belonged to at the time.
CREATE TABLE IF NOT EXISTS analytics.dim_employee (
  employee_key serial PRIMARY KEY,
  employee_id  integer NOT NULL,
  full_name    text NOT NULL,
  department   text NOT NULL,
  company_key  integer NOT NULL,
  job_title    text NOT NULL,
  valid_from   date NOT NULL,
  valid_to     date NOT NULL DEFAULT '9999-12-31',
  is_current   boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS dim_employee_current_uq ON analytics.dim_employee (employee_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS dim_employee_lookup_idx ON analytics.dim_employee (employee_id, valid_from, valid_to);

-- ── Facts ─────────────────────────────────────────────────────────────────────

-- Accumulating snapshot: one row per deal, updated as it moves through the pipeline.
CREATE TABLE IF NOT EXISTS analytics.fact_deal (
  deal_id             integer PRIMARY KEY,
  created_date_key    integer NOT NULL REFERENCES analytics.dim_date,
  closed_date_key     integer REFERENCES analytics.dim_date,
  customer_key        integer NOT NULL REFERENCES analytics.dim_customer,
  employee_key        integer NOT NULL REFERENCES analytics.dim_employee,
  company_key         integer NOT NULL REFERENCES analytics.dim_company,
  stage               text NOT NULL,
  value_eur           numeric(12, 2) NOT NULL,
  weighted_value_eur  numeric(12, 2) NOT NULL,
  is_won              boolean NOT NULL,
  is_closed           boolean NOT NULL,
  days_to_close       integer
);
CREATE INDEX IF NOT EXISTS fact_deal_closed_idx ON analytics.fact_deal (company_key, closed_date_key) WHERE is_closed;
CREATE INDEX IF NOT EXISTS fact_deal_open_idx ON analytics.fact_deal (company_key, stage) WHERE NOT is_closed;

-- Transaction grain: one row per service ticket.
CREATE TABLE IF NOT EXISTS analytics.fact_ticket (
  ticket_id               integer PRIMARY KEY,
  created_date_key        integer NOT NULL REFERENCES analytics.dim_date,
  resolved_date_key       integer REFERENCES analytics.dim_date,
  customer_key            integer NOT NULL REFERENCES analytics.dim_customer,
  employee_key            integer REFERENCES analytics.dim_employee,
  company_key             integer NOT NULL REFERENCES analytics.dim_company,
  priority                text NOT NULL,
  channel                 text NOT NULL,
  is_resolved             boolean NOT NULL,
  first_response_minutes  integer,
  resolution_hours        numeric(8, 1),
  sla_met                 boolean
);
CREATE INDEX IF NOT EXISTS fact_ticket_created_idx ON analytics.fact_ticket (company_key, created_date_key);

-- One row per invoice. is_overdue is evaluated at refresh time.
CREATE TABLE IF NOT EXISTS analytics.fact_invoice (
  invoice_id      integer PRIMARY KEY,
  issue_date_key  integer NOT NULL REFERENCES analytics.dim_date,
  due_date_key    integer NOT NULL REFERENCES analytics.dim_date,
  paid_date_key   integer REFERENCES analytics.dim_date,
  customer_key    integer NOT NULL REFERENCES analytics.dim_customer,
  company_key     integer NOT NULL REFERENCES analytics.dim_company,
  status          text NOT NULL,
  amount_eur      numeric(12, 2) NOT NULL,
  days_to_pay     integer,
  days_overdue    integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS fact_invoice_issue_idx ON analytics.fact_invoice (company_key, issue_date_key);
CREATE INDEX IF NOT EXISTS fact_invoice_open_idx ON analytics.fact_invoice (company_key) WHERE status = 'OPEN';

-- Periodic grain: one row per employee per absent working day (approved leave only).
CREATE TABLE IF NOT EXISTS analytics.fact_absence_day (
  date_key      integer NOT NULL REFERENCES analytics.dim_date,
  employee_key  integer NOT NULL REFERENCES analytics.dim_employee,
  company_key   integer NOT NULL REFERENCES analytics.dim_company,
  leave_type    text NOT NULL,
  PRIMARY KEY (date_key, employee_key)
);
CREATE INDEX IF NOT EXISTS fact_absence_company_idx ON analytics.fact_absence_day (company_key, date_key);

CREATE TABLE IF NOT EXISTS analytics.etl_log (
  id           serial PRIMARY KEY,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  rows_loaded  jsonb,
  error        text
);

-- ── Monthly KPI mart ──────────────────────────────────────────────────────────
-- Pre-aggregated so the dashboard reads a few hundred rows instead of scanning facts.
-- Refreshed CONCURRENTLY (needs the unique index) so readers are never blocked.

DROP MATERIALIZED VIEW IF EXISTS analytics.mv_kpi_monthly;
CREATE MATERIALIZED VIEW analytics.mv_kpi_monthly AS
WITH months AS (
  SELECT DISTINCT d.month_start, c.company_key
  FROM analytics.dim_date d CROSS JOIN analytics.dim_company c
  WHERE d.full_date BETWEEN date_trunc('month', now()) - interval '23 months' AND now()
),
deals AS (
  SELECT d.month_start, f.company_key,
         count(*) FILTER (WHERE f.is_won)                    AS deals_won,
         count(*) FILTER (WHERE f.is_closed AND NOT f.is_won) AS deals_lost,
         sum(f.value_eur) FILTER (WHERE f.is_won)             AS won_value_eur,
         avg(f.days_to_close) FILTER (WHERE f.is_won)         AS avg_days_to_close
  FROM analytics.fact_deal f JOIN analytics.dim_date d ON d.date_key = f.closed_date_key
  WHERE f.is_closed GROUP BY 1, 2
),
tickets AS (
  SELECT d.month_start, f.company_key,
         count(*)                                         AS tickets_created,
         avg(f.sla_met::int) FILTER (WHERE f.is_resolved) AS sla_rate,
         avg(f.resolution_hours)                          AS avg_resolution_hours,
         avg(f.first_response_minutes)                    AS avg_first_response_minutes
  FROM analytics.fact_ticket f JOIN analytics.dim_date d ON d.date_key = f.created_date_key
  GROUP BY 1, 2
),
invoices AS (
  SELECT d.month_start, f.company_key,
         sum(f.amount_eur) FILTER (WHERE f.status <> 'CANCELLED') AS invoiced_eur,
         avg(f.days_to_pay)                                      AS avg_days_to_pay
  FROM analytics.fact_invoice f JOIN analytics.dim_date d ON d.date_key = f.issue_date_key
  GROUP BY 1, 2
),
absence AS (
  SELECT d.month_start, f.company_key, count(*) AS absence_days,
         count(*) FILTER (WHERE f.leave_type = 'SICK') AS sick_days
  FROM analytics.fact_absence_day f JOIN analytics.dim_date d ON d.date_key = f.date_key
  GROUP BY 1, 2
)
SELECT m.month_start, m.company_key,
       coalesce(i.invoiced_eur, 0)::numeric(14, 2)  AS invoiced_eur,
       i.avg_days_to_pay::numeric(8, 1)             AS avg_days_to_pay,
       coalesce(dl.deals_won, 0)                    AS deals_won,
       coalesce(dl.deals_lost, 0)                   AS deals_lost,
       coalesce(dl.won_value_eur, 0)::numeric(14, 2) AS won_value_eur,
       dl.avg_days_to_close::numeric(8, 1)          AS avg_days_to_close,
       coalesce(t.tickets_created, 0)               AS tickets_created,
       t.sla_rate::numeric(5, 4)                    AS sla_rate,
       t.avg_resolution_hours::numeric(8, 1)        AS avg_resolution_hours,
       t.avg_first_response_minutes::numeric(8, 1)  AS avg_first_response_minutes,
       coalesce(a.absence_days, 0)                  AS absence_days,
       coalesce(a.sick_days, 0)                     AS sick_days
FROM months m
LEFT JOIN deals dl   USING (month_start, company_key)
LEFT JOIN tickets t  USING (month_start, company_key)
LEFT JOIN invoices i USING (month_start, company_key)
LEFT JOIN absence a  USING (month_start, company_key);

CREATE UNIQUE INDEX mv_kpi_monthly_uq ON analytics.mv_kpi_monthly (month_start, company_key);
