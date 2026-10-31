/**
 * Builds the Kompass integration flow in a running NiFi 2.x via its REST API and exports it as a
 * versionable flow definition (nifi/kompass-flow.json) that can be imported with "Upload flow definition".
 *
 *   NIFI_URL=https://localhost:8444/nifi-api NIFI_USER=admin NIFI_PASSWORD=... node nifi/build-flow.mjs
 *
 * Property names are resolved from NiFi's own descriptors (display name → internal name), so the script
 * keeps working across minor NiFi versions.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= "0"; // local NiFi uses a self-signed certificate
const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.NIFI_URL ?? "https://localhost:8444/nifi-api";
const env = (k, d) => process.env[k] ?? d;

let token;
async function call(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}
const rev = { revision: { version: 0 } };

async function login() {
  const res = await fetch(`${BASE}/access/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: env("NIFI_USER", "admin"), password: env("NIFI_PASSWORD", "kompass-nifi-dev") }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  token = await res.text();
}

/** Maps { "Display Name": "value" } to internal property names, translating allowable-value display names too. */
function mapProps(descriptors, wanted) {
  const out = {};
  for (const [label, value] of Object.entries(wanted)) {
    const d = Object.values(descriptors).find((x) => x.displayName === label || x.name === label);
    if (!d) {
      out[label] = value; // dynamic property (e.g. an HTTP header)
      continue;
    }
    const allowed = d.allowableValues?.find((a) => a.allowableValue.displayName === value || a.allowableValue.value === value);
    out[d.name] = allowed ? allowed.allowableValue.value : value;
  }
  return out;
}

async function typeOf(kind, simpleName) {
  const list = kind === "processor" ? (await call("GET", "/flow/processor-types")).processorTypes : (await call("GET", "/flow/controller-service-types")).controllerServiceTypes;
  const t = list.find((x) => x.type.endsWith(`.${simpleName}`));
  if (!t) throw new Error(`${kind} type ${simpleName} not available`);
  return { type: t.type, bundle: t.bundle };
}

async function service(groupId, simpleName, name, props) {
  const created = await call("POST", `/process-groups/${groupId}/controller-services`, { ...rev, component: { ...(await typeOf("service", simpleName)), name } });
  const properties = mapProps(created.component.descriptors, props);
  const updated = await call("PUT", `/controller-services/${created.id}`, { revision: created.revision, component: { id: created.id, properties } });
  return updated;
}

async function processor(groupId, simpleName, name, x, y, props = {}, opts = {}) {
  const created = await call("POST", `/process-groups/${groupId}/processors`, { ...rev, component: { ...(await typeOf("processor", simpleName)), name, position: { x, y } } });
  const config = { properties: mapProps(created.component.config.descriptors, props), autoTerminatedRelationships: opts.terminate ?? [], ...(opts.schedule ? { schedulingPeriod: opts.schedule } : {}), ...(opts.penalty ? { penaltyDuration: opts.penalty } : {}), ...(opts.comments ? { comments: opts.comments } : {}), ...(opts.sensitiveDynamic ? { sensitiveDynamicPropertyNames: opts.sensitiveDynamic } : {}) };
  return call("PUT", `/processors/${created.id}`, { revision: created.revision, component: { id: created.id, config } });
}

async function connect(groupId, from, to, relationships, opts = {}) {
  return call("POST", `/process-groups/${groupId}/connections`, {
    ...rev,
    component: {
      source: { id: from.id, groupId, type: "PROCESSOR" },
      destination: { id: to.id, groupId, type: "PROCESSOR" },
      selectedRelationships: relationships,
      backPressureObjectThreshold: 1000,
      flowFileExpiration: opts.expire ?? "0 sec",
      ...(opts.bends ? { bends: opts.bends } : {}),
    },
  });
}

async function group(parentId, name, x, y, comments) {
  return call("POST", `/process-groups/${parentId}/process-groups`, { ...rev, component: { name, position: { x, y }, comments } });
}

async function main() {
  await login();
  const root = (await call("GET", "/flow/process-groups/root")).processGroupFlow.id;
  const existing = (await call("GET", `/process-groups/${root}/process-groups`)).processGroups.find((g) => g.component.name === "Kompass Integration");
  if (existing) throw new Error(`"Kompass Integration" already exists (${existing.id}); delete it in the NiFi UI first`);

  const params = await call("POST", "/parameter-contexts", {
    ...rev,
    component: {
      name: "Kompass",
      description: "Endpoints and secrets for the Kompass integration. Set per environment.",
      parameters: [
        { parameter: { name: "KOMPASS_API_URL", value: env("KOMPASS_API_URL", "http://localhost:4100"), description: "Base URL of the Kompass API" } },
        { parameter: { name: "KOMPASS_INGEST_API_KEY", value: env("KOMPASS_INGEST_API_KEY", "dev-ingest-key-change-me-0123456789"), sensitive: true, description: "INGEST_API_KEY of the Kompass API" } },
        { parameter: { name: "ERP_INBOX", value: env("ERP_INBOX", path.join(here, "inbox")), description: "Folder the ERP writes nightly invoice exports to" } },
        { parameter: { name: "ERP_FAILED", value: env("ERP_FAILED", path.join(here, "failed")), description: "Exports the API rejected completely or that could not be delivered" } },
        { parameter: { name: "CRM_URL", value: env("CRM_URL", "http://localhost:4200"), description: "Base URL of the CRM REST API" } },
      ],
    },
  });

  const top = await group(root, "Kompass Integration", 0, 0, "ERP and CRM data into the Kompass platform. See docs/nifi.md.");
  await call("PUT", `/process-groups/${top.id}`, { revision: top.revision, component: { id: top.id, parameterContext: { id: params.id } } });

  // ── ERP invoices: nightly CSV export → JSON → Kompass ────────────────────────
  const erp = await group(top.id, "ERP invoices (CSV)", 0, 0, "GetFile → ConvertRecord (CSV→JSON) → InvokeHTTP POST /api/ingest/erp-invoices");
  await call("PUT", `/process-groups/${erp.id}`, { revision: erp.revision, component: { id: erp.id, parameterContext: { id: params.id } } });
  const csv = await service(erp.id, "CSVReader", "ERP CSV (semicolon, header)", { "Schema Access Strategy": "Use String Fields From Header", "CSV Format": "Custom Format", "Value Separator": ";", "Treat First Line as Header": "true" });
  const json = await service(erp.id, "JsonRecordSetWriter", "JSON array", { "Output Grouping": "Array" });
  const getFile = await processor(erp.id, "GetFile", "Pick up ERP export", 0, 0, { "Input Directory": "#{ERP_INBOX}", "File Filter": "invoices_.*\\.csv", "Keep Source File": "false" }, { schedule: "1 min", comments: "The ERP writes invoices_YYYY-MM-DD.csv around 02:00." });
  const convert = await processor(erp.id, "ConvertRecord", "CSV to JSON", 0, 220, { "Record Reader": csv.id, "Record Writer": json.id });
  const postInvoices = await processor(erp.id, "InvokeHTTP", "POST to Kompass", 0, 440, {
    "HTTP Method": "POST",
    "HTTP URL": "#{KOMPASS_API_URL}/api/ingest/erp-invoices",
    "Request Content-Type": "application/json",
    "X-Api-Key": "#{KOMPASS_INGEST_API_KEY}",
    "X-Batch-Id": "${filename}",
  }, { terminate: ["Response", "Original"], penalty: "60 sec", sensitiveDynamic: ["X-Api-Key"], comments: "200 = all applied, 207 = some rows rejected (see Kompass › Data pipelines). Same filename = same batch, so retries are idempotent." });
  const parkErp = await processor(erp.id, "PutFile", "Park failed export", 480, 440, { Directory: "#{ERP_FAILED}", "Conflict Resolution Strategy": "replace" }, { terminate: ["success", "failure"] });
  await connect(erp.id, getFile, convert, ["success"]);
  await connect(erp.id, convert, postInvoices, ["success"]);
  await connect(erp.id, convert, parkErp, ["failure"]);
  await connect(erp.id, postInvoices, postInvoices, ["Retry"], { bends: [{ x: -220, y: 470 }, { x: -220, y: 560 }] });
  await connect(erp.id, postInvoices, parkErp, ["No Retry", "Failure"]);

  // ── CRM customers: poll REST API → map fields → Kompass ─────────────────────
  const crm = await group(top.id, "CRM customers (REST)", 520, 0, "InvokeHTTP GET (every 15 min) → JoltTransformJSON → InvokeHTTP POST /api/ingest/crm-customers");
  await call("PUT", `/process-groups/${crm.id}`, { revision: crm.revision, component: { id: crm.id, parameterContext: { id: params.id } } });
  const fetchCrm = await processor(crm.id, "InvokeHTTP", "GET customers from CRM", 0, 0, { "HTTP Method": "GET", "HTTP URL": "#{CRM_URL}/api/v2/kunden" }, { schedule: "15 min", terminate: ["Original", "Retry", "No Retry", "Failure"], comments: "Runs without an incoming connection, so NiFi triggers it on the schedule." });
  const jolt = await processor(crm.id, "JoltTransformJSON", "Map CRM fields", 0, 220, { "Jolt Transform": "Chain", "Jolt Specification": readFileSync(path.join(here, "crm-to-kompass.jolt.json"), "utf8") }, { terminate: ["failure"] });
  const postCustomers = await processor(crm.id, "InvokeHTTP", "POST to Kompass", 0, 440, {
    "HTTP Method": "POST",
    "HTTP URL": "#{KOMPASS_API_URL}/api/ingest/crm-customers",
    "Request Content-Type": "application/json",
    "X-Api-Key": "#{KOMPASS_INGEST_API_KEY}",
    "X-Batch-Id": "crm-${now():format('yyyyMMdd-HHmm')}",
  }, { terminate: ["Response", "Original", "No Retry", "Failure"], penalty: "60 sec", sensitiveDynamic: ["X-Api-Key"] });
  await connect(crm.id, fetchCrm, jolt, ["Response"]);
  await connect(crm.id, jolt, postCustomers, ["success"]);
  await connect(crm.id, postCustomers, postCustomers, ["Retry"], { bends: [{ x: -220, y: 470 }, { x: -220, y: 560 }] });

  // Enable controller services, then report validation state of every processor.
  for (const svc of [csv, json]) {
    const cur = await call("GET", `/controller-services/${svc.id}`);
    await call("PUT", `/controller-services/${svc.id}/run-status`, { revision: cur.revision, state: "ENABLED" });
  }
  await new Promise((r) => setTimeout(r, 2000));
  const problems = [];
  for (const g of [erp, crm]) {
    for (const p of (await call("GET", `/process-groups/${g.id}/processors`)).processors) {
      if (p.component.validationStatus !== "VALID") problems.push(`${g.component.name} › ${p.component.name}: ${(p.component.validationErrors ?? []).join("; ")}`);
    }
  }
  if (problems.length) throw new Error(`invalid processors:\n  ${problems.join("\n  ")}`);

  const definition = await call("GET", `/process-groups/${top.id}/download?includeReferencedServices=true`);
  writeFileSync(path.join(here, "kompass-flow.json"), `${JSON.stringify(definition, null, 2)}\n`);
  console.log(`flow built and valid; exported to nifi/kompass-flow.json (group ${top.id})`);
  if (process.argv.includes("--start")) {
    await call("PUT", `/flow/process-groups/${top.id}`, { id: top.id, state: "RUNNING" });
    console.log("all processors started");
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
