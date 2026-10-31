-- ETL from the operational schema into the star schema. Runs inside one transaction.
-- Small data volumes (thousands of rows) make a full fact rebuild simpler and safer than CDC.

-- Companies (type 0/1)
INSERT INTO analytics.dim_company (company_key, code, name, city)
SELECT id, code, name, city FROM "Company"
ON CONFLICT (company_key) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city;

-- Customers (SCD type 1)
INSERT INTO analytics.dim_customer (customer_id, number, name, segment, city, postal_area)
SELECT id, number, name, segment::text, city, left("postalCode", 2) FROM "Customer"
ON CONFLICT (customer_id) DO UPDATE
SET number = EXCLUDED.number, name = EXCLUDED.name, segment = EXCLUDED.segment, city = EXCLUDED.city, postal_area = EXCLUDED.postal_area;

-- Employees (SCD type 2) ─ step 1: close current versions whose tracked attributes changed.
WITH src AS (
  SELECT e.id, d.name AS department, e."companyId" AS company_key, e."jobTitle" AS job_title
  FROM "Employee" e JOIN "Department" d ON d.id = e."departmentId"
)
UPDATE analytics.dim_employee de
SET valid_to = current_date - 1, is_current = false
FROM src
WHERE de.employee_id = src.id AND de.is_current
  AND (de.department, de.company_key, de.job_title) IS DISTINCT FROM (src.department, src.company_key, src.job_title);

-- step 2: insert a new current version for new employees and the ones closed above.
-- The first version starts at the hire date so historical facts can be attributed.
INSERT INTO analytics.dim_employee (employee_id, full_name, department, company_key, job_title, valid_from)
SELECT e.id, e."firstName" || ' ' || e."lastName", d.name, e."companyId", e."jobTitle",
       CASE WHEN EXISTS (SELECT 1 FROM analytics.dim_employee x WHERE x.employee_id = e.id) THEN current_date ELSE e."hireDate" END
FROM "Employee" e JOIN "Department" d ON d.id = e."departmentId"
WHERE NOT EXISTS (SELECT 1 FROM analytics.dim_employee de WHERE de.employee_id = e.id AND de.is_current);

-- Names are type 1 (overwritten in every version) so a GDPR pseudonymization propagates to history.
UPDATE analytics.dim_employee de SET full_name = e."firstName" || ' ' || e."lastName"
FROM "Employee" e WHERE e.id = de.employee_id AND de.full_name <> e."firstName" || ' ' || e."lastName";

-- Version of an employee valid on a given day (falls back to the earliest version for older facts).
CREATE OR REPLACE FUNCTION pg_temp.employee_key_at(emp integer, d date) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT employee_key FROM analytics.dim_employee
  WHERE employee_id = emp ORDER BY (d BETWEEN valid_from AND valid_to) DESC, valid_from LIMIT 1
$$;

TRUNCATE analytics.fact_deal, analytics.fact_ticket, analytics.fact_invoice, analytics.fact_absence_day;

INSERT INTO analytics.fact_deal
SELECT dl.id,
       to_char(dl."createdAt", 'YYYYMMDD')::int,
       CASE WHEN dl."closedAt" IS NOT NULL THEN to_char(dl."closedAt", 'YYYYMMDD')::int END,
       dc.customer_key,
       pg_temp.employee_key_at(dl."ownerId", dl."createdAt"::date),
       dl."companyId",
       dl.stage::text,
       dl."valueCents" / 100.0,
       dl."valueCents" * dl.probability / 10000.0,
       dl.stage = 'WON',
       dl.stage IN ('WON', 'LOST'),
       CASE WHEN dl."closedAt" IS NOT NULL THEN (dl."closedAt"::date - dl."createdAt"::date) END
FROM "Deal" dl JOIN analytics.dim_customer dc ON dc.customer_id = dl."customerId";

INSERT INTO analytics.fact_ticket
SELECT t.id,
       to_char(t."createdAt", 'YYYYMMDD')::int,
       CASE WHEN t."resolvedAt" IS NOT NULL THEN to_char(t."resolvedAt", 'YYYYMMDD')::int END,
       dc.customer_key,
       CASE WHEN t."assigneeId" IS NOT NULL THEN pg_temp.employee_key_at(t."assigneeId", t."createdAt"::date) END,
       t."companyId",
       t.priority::text,
       t.channel::text,
       t."resolvedAt" IS NOT NULL,
       CASE WHEN t."firstResponseAt" IS NOT NULL THEN extract(epoch FROM t."firstResponseAt" - t."createdAt")::int / 60 END,
       CASE WHEN t."resolvedAt" IS NOT NULL THEN round((extract(epoch FROM t."resolvedAt" - t."createdAt") / 3600)::numeric, 1) END,
       CASE WHEN t."resolvedAt" IS NOT NULL THEN t."resolvedAt" <= t."slaDueAt" END
FROM "Ticket" t JOIN analytics.dim_customer dc ON dc.customer_id = t."customerId";

INSERT INTO analytics.fact_invoice
SELECT i.id,
       to_char(i."issueDate", 'YYYYMMDD')::int,
       to_char(i."dueDate", 'YYYYMMDD')::int,
       CASE WHEN i."paidAt" IS NOT NULL THEN to_char(i."paidAt", 'YYYYMMDD')::int END,
       dc.customer_key,
       i."companyId",
       i.status::text,
       i."amountCents" / 100.0,
       CASE WHEN i."paidAt" IS NOT NULL THEN i."paidAt" - i."issueDate" END,
       CASE WHEN i.status = 'OPEN' AND i."dueDate" < current_date THEN current_date - i."dueDate" ELSE 0 END
FROM "Invoice" i JOIN analytics.dim_customer dc ON dc.customer_id = i."customerId";

INSERT INTO analytics.fact_absence_day
SELECT dd.date_key, pg_temp.employee_key_at(l."employeeId", dd.full_date), e."companyId", l.type::text
FROM "LeaveRequest" l
JOIN "Employee" e ON e.id = l."employeeId"
JOIN analytics.dim_date dd ON dd.full_date BETWEEN l."startDate" AND l."endDate" AND NOT dd.is_weekend
WHERE l.status = 'APPROVED'
ON CONFLICT DO NOTHING;
