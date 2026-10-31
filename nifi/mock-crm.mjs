/**
 * Stand-in for the external CRM's REST API (GET /api/v2/kunden). Field names are German on purpose so the
 * NiFi flow has a real mapping step (JoltTransformJSON). Run: node nifi/mock-crm.mjs  (port 4200)
 */
import { createServer } from "node:http";

const customers = [
  { kundennummer: "K-20001", firma: "Bäckerei Hansen Köln", segment: "GEWERBE", email: "info@baeckerei-hansen.example", telefon: "+49 221 445566", strasse: "Venloer Str. 12", plz: "50672", ort: "Köln" },
  { kundennummer: "K-20190", firma: "Kita Regenbogen e.V.", segment: "OEFFENTLICH", email: "leitung@kita-regenbogen.example", telefon: "+49 221 778899", strasse: "Neusser Str. 201", plz: "50733", ort: "Köln" },
  { kundennummer: "K-20191", firma: "Familie Yıldız", segment: "PRIVAT", email: null, telefon: "+49 2202 123456", strasse: "Hauptstr. 7", plz: "51465", ort: "Bergisch Gladbach" },
  { kundennummer: "K-20192", firma: "Praxis Dr. Albers", segment: "GEWERBE", email: "praxis@albers.example", telefon: null, strasse: "Bonner Str. 88", plz: "50677", ort: "Köln" },
  { kundennummer: "K-2019X", firma: "Kaputter Datensatz", segment: "GEWERBE", email: "kein-email", telefon: null, strasse: null, plz: "123", ort: "?" },
];

createServer((req, res) => {
  if (req.url?.startsWith("/api/v2/kunden")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ daten: customers, stand: new Date().toISOString() }));
    return;
  }
  res.writeHead(404).end();
}).listen(Number(process.env.PORT ?? 4200), () => console.log("mock CRM on http://localhost:4200/api/v2/kunden"));
