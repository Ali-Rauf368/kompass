/** Hand-maintained OpenAPI 3.1 description of the public endpoints (rendered at /api/docs). */
const json = (schema: object = { type: "object" }) => ({ "application/json": { schema } });
const ok = (description: string, schema?: object) => ({ description, content: json(schema) });
const err = { $ref: "#/components/schemas/Error" };
const std = { "400": ok("Validation failed", err), "401": ok("Not signed in", err), "403": ok("Missing role", err) };
const id = { name: "id", in: "path", required: true, schema: { type: "integer" } };
const q = (...names: string[]) => names.map((name) => ({ name, in: "query", schema: { type: "string" } }));
const body = (schema: object) => ({ required: true, content: json(schema) });
const session = [{ cookieAuth: [] }];

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Kompass API",
    version: "1.0.0",
    description:
      "Internal operations platform of the Rheinwerk Gruppe. Browser clients authenticate with the session cookie set by POST /api/auth/login (LDAP) and must send `X-Kompass-Client: web` on writes. NiFi uses `X-Api-Key` on /api/ingest. Live updates: WebSocket at /ws.",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: "kompass_session" },
      apiKey: { type: "apiKey", in: "header", name: "X-Api-Key" },
    },
    schemas: {
      Error: { type: "object", properties: { error: { type: "string" }, details: {} }, required: ["error"] },
      Paged: { type: "object", properties: { items: { type: "array", items: {} }, total: { type: "integer" }, page: { type: "integer" }, pageSize: { type: "integer" }, pages: { type: "integer" } } },
    },
  },
  security: session,
  paths: {
    "/api/health": { get: { tags: ["System"], security: [], summary: "Health and dependency checks", responses: { "200": ok("Healthy"), "503": ok("A dependency is down") } } },
    "/api/auth/login": {
      post: { tags: ["Auth"], security: [], summary: "Sign in with Active Directory credentials", requestBody: body({ type: "object", required: ["username", "password"], properties: { username: { type: "string", example: "anna.schmidt" }, password: { type: "string", example: "kompass" } } }), responses: { "200": ok("Signed in; sets the session cookie"), "401": ok("Wrong credentials", err), "429": ok("Rate limited", err), "503": ok("Directory unreachable", err) } },
    },
    "/api/auth/signup": {
      post: { tags: ["Auth"], security: [], summary: "Create a self-registered account (EMPLOYEE role only)", requestBody: body({ type: "object", required: ["username", "displayName", "email", "password"], properties: { username: { type: "string", example: "max.muster" }, displayName: { type: "string", example: "Max Muster" }, email: { type: "string", example: "max@example.com" }, password: { type: "string", minLength: 10 } } }), responses: { "201": ok("Account created; sets the session cookie"), "400": ok("Invalid input", err), "409": ok("Username taken", err), "429": ok("Rate limited", err), "503": ok("Directory unreachable", err) } },
    },
    "/api/auth/logout": { post: { tags: ["Auth"], summary: "Sign out", responses: { "204": { description: "Signed out" } } } },
    "/api/auth/me": { get: { tags: ["Auth"], summary: "Current user and roles", responses: { "200": ok("User"), ...std } } },
    "/api/employees": { get: { tags: ["HR"], summary: "Employee directory (HR sees personnel fields)", parameters: q("q", "department", "company", "status", "sort", "page", "pageSize"), responses: { "200": ok("Page of employees", { $ref: "#/components/schemas/Paged" }), ...std } } },
    "/api/employees/{id}": {
      get: { tags: ["HR"], summary: "Employee profile", parameters: [id], responses: { "200": ok("Employee"), ...std } },
      patch: { tags: ["HR"], summary: "Update job, department, manager or status (HR)", parameters: [id], requestBody: body({ type: "object" }), responses: { "200": ok("Updated"), ...std } },
    },
    "/api/leave": {
      get: { tags: ["HR"], summary: "Leave requests", parameters: q("view", "status", "year", "page", "pageSize"), responses: { "200": ok("Page of requests"), ...std } },
      post: { tags: ["HR"], summary: "Request leave (working days exclude weekends and NRW holidays)", requestBody: body({ type: "object", required: ["type", "startDate", "endDate"], properties: { type: { enum: ["VACATION", "TRAINING", "OTHER"] }, startDate: { type: "string", format: "date" }, endDate: { type: "string", format: "date" }, note: { type: "string" } } }), responses: { "201": ok("Created"), "409": ok("Overlaps existing leave", err), ...std } },
    },
    "/api/leave/balance": { get: { tags: ["HR"], summary: "My vacation balance this year", responses: { "200": ok("Balance"), ...std } } },
    "/api/leave/{id}/decision": { post: { tags: ["HR"], summary: "Approve or reject (manager or HR)", parameters: [id], requestBody: body({ type: "object", properties: { decision: { enum: ["APPROVED", "REJECTED"] }, note: { type: "string" } } }), responses: { "200": ok("Decided"), ...std } } },
    "/api/leave/{id}/cancel": { post: { tags: ["HR"], summary: "Cancel my upcoming leave", parameters: [id], responses: { "200": ok("Cancelled"), ...std } } },
    "/api/customers": { get: { tags: ["Sales"], summary: "Customers", parameters: q("q", "segment", "page", "pageSize"), responses: { "200": ok("Page of customers"), ...std } } },
    "/api/customers/{id}": { get: { tags: ["Sales"], summary: "Customer with recent deals, tickets and invoices", parameters: [id], responses: { "200": ok("Customer"), ...std } } },
    "/api/deals": {
      get: { tags: ["Sales"], summary: "Deals", parameters: q("stage", "company", "owner", "q", "page", "pageSize"), responses: { "200": ok("Page of deals"), ...std } },
      post: { tags: ["Sales"], summary: "Create a deal", requestBody: body({ type: "object" }), responses: { "201": ok("Created"), ...std } },
    },
    "/api/deals/board": { get: { tags: ["Sales"], summary: "Pipeline board grouped by stage", parameters: q("company"), responses: { "200": ok("Columns"), ...std } } },
    "/api/deals/{id}/stage": { patch: { tags: ["Sales"], summary: "Move a deal to another stage", parameters: [id], requestBody: body({ type: "object", properties: { stage: { type: "string" }, lostReason: { type: "string" } } }), responses: { "200": ok("Moved"), "409": ok("Deal already closed", err), ...std } } },
    "/api/tickets": {
      get: { tags: ["After-sales"], summary: "Service tickets, most urgent first", parameters: q("status", "priority", "assignee", "sla", "q", "page", "pageSize"), responses: { "200": ok("Page of tickets"), ...std } },
      post: { tags: ["After-sales"], summary: "Open a ticket (SLA from priority)", requestBody: body({ type: "object" }), responses: { "201": ok("Created"), ...std } },
    },
    "/api/tickets/{id}": {
      get: { tags: ["After-sales"], summary: "Ticket with activity feed (MongoDB)", parameters: [id], responses: { "200": ok("Ticket"), ...std } },
      patch: { tags: ["After-sales"], summary: "Change status, priority or assignee", parameters: [id], requestBody: body({ type: "object" }), responses: { "200": ok("Updated"), ...std } },
    },
    "/api/tickets/{id}/comments": { post: { tags: ["After-sales"], summary: "Add a comment", parameters: [id], requestBody: body({ type: "object", properties: { body: { type: "string" }, internal: { type: "boolean" } } }), responses: { "201": ok("Added"), ...std } } },
    "/api/invoices": { get: { tags: ["Accounting"], summary: "Invoices (status=OVERDUE for open past due)", parameters: q("status", "company", "q", "page", "pageSize"), responses: { "200": ok("Page of invoices"), ...std } } },
    "/api/invoices/aging": { get: { tags: ["Accounting"], summary: "Receivables aging buckets", parameters: q("company"), responses: { "200": ok("Buckets"), ...std } } },
    "/api/invoices/{id}/mark-paid": { post: { tags: ["Accounting"], summary: "Record a payment", parameters: [id], responses: { "200": ok("Paid"), ...std } } },
    "/api/analytics/overview": { get: { tags: ["Analytics"], summary: "Dashboard KPIs from the star schema", parameters: q("company", "months"), responses: { "200": ok("KPIs and series"), ...std } } },
    "/api/analytics/absence-by-department": { get: { tags: ["Analytics"], summary: "Absence days by department and type", parameters: q("months"), responses: { "200": ok("Rows"), ...std } } },
    "/api/analytics/refresh": { post: { tags: ["Analytics"], summary: "Run the warehouse ETL now (admin)", responses: { "200": ok("Refreshed"), ...std } } },
    "/api/ingest/{pipeline}": {
      post: {
        tags: ["Integration"],
        security: [{ apiKey: [] }],
        summary: "Receive a batch from Apache NiFi",
        description: "Idempotent per X-Batch-Id. Returns 200 when all records were applied, 207 when some were rejected, 422 when all were rejected.",
        parameters: [{ name: "pipeline", in: "path", required: true, schema: { enum: ["erp-invoices", "crm-customers"] } }, { name: "X-Batch-Id", in: "header", schema: { type: "string" } }],
        requestBody: body({ type: "array", items: { type: "object" } }),
        responses: { "200": ok("All applied"), "207": ok("Partially applied"), "401": ok("Invalid API key", err), "422": ok("All rejected") },
      },
    },
    "/api/pipelines": { get: { tags: ["Integration"], summary: "Pipeline health (last run, 14-day success rate)", responses: { "200": ok("Pipelines"), ...std } } },
    "/api/pipelines/runs": { get: { tags: ["Integration"], summary: "Ingestion run history", parameters: q("pipeline", "status", "page", "pageSize"), responses: { "200": ok("Runs"), ...std } } },
    "/api/notifications": { get: { tags: ["Notifications"], summary: "My notifications", responses: { "200": ok("Notifications"), ...std } } },
    "/api/notifications/read-all": { post: { tags: ["Notifications"], summary: "Mark all as read", responses: { "204": { description: "Done" } } } },
    "/api/admin/audit": { get: { tags: ["Admin"], summary: "Audit log (MongoDB)", parameters: q("actor", "action", "entityType", "personalData", "page", "pageSize"), responses: { "200": ok("Page of events"), ...std } } },
    "/api/admin/users": { get: { tags: ["Admin"], summary: "Users provisioned from LDAP", responses: { "200": ok("Users"), ...std } } },
    "/api/gdpr/employees/{id}/export": { get: { tags: ["GDPR"], summary: "Data export (Art. 15/20)", parameters: [id], responses: { "200": ok("JSON export"), ...std } } },
    "/api/gdpr/employees/{id}/erase": { post: { tags: ["GDPR"], summary: "Pseudonymise a former employee (Art. 17)", parameters: [id], requestBody: body({ type: "object", properties: { confirm: { const: "ERASE" } } }), responses: { "200": ok("Erased"), "409": ok("Not a former employee", err), ...std } } },
    "/api/gdpr/retention/run": { post: { tags: ["GDPR"], summary: "Apply the retention policy now (admin)", responses: { "200": ok("Result"), ...std } } },
  },
};
