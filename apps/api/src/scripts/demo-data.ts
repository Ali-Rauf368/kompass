/**
 * Deterministic demo data for the fictional Rheinwerk Gruppe (Cologne): four building-services companies.
 * The same generator feeds the database seed and the mock Active Directory, so logins match employees.
 */
import type { DirectoryEntry } from "../ldap-directory";

/** Small seeded PRNG (mulberry32) so every seed run produces identical data. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)]!,
    chance: (p: number) => next() < p,
  };
}

export const COMPANIES = [
  { code: "RWH", name: "Rheinwerk Haustechnik GmbH", city: "Köln" },
  { code: "RWS", name: "Rheinwerk Solar GmbH", city: "Köln" },
  { code: "RWE", name: "Rheinwerk Elektro GmbH", city: "Leverkusen" },
  { code: "RWK", name: "Rheinwerk Kundenservice GmbH", city: "Bergisch Gladbach" },
] as const;

export const DEPARTMENTS = [
  { code: "MGMT", name: "Management" },
  { code: "HR", name: "Human Resources" },
  { code: "SALES", name: "Sales" },
  { code: "AFTERSALES", name: "After-Sales" },
  { code: "ACCOUNTING", name: "Accounting" },
  { code: "FIELD", name: "Field Service" },
] as const;

type Dept = (typeof DEPARTMENTS)[number]["code"];

export interface DemoEmployee {
  personnelNo: string;
  firstName: string;
  lastName: string;
  username: string;
  jobTitle: string;
  department: Dept;
  company: (typeof COMPANIES)[number]["code"];
  managerUsername: string | null;
  hireDate: string;
  groups: DirectoryEntry["groups"];
}

/** Named demo accounts, one per role, documented in the README and on the login page. */
const KEY_PEOPLE: Omit<DemoEmployee, "personnelNo" | "hireDate">[] = [
  { firstName: "Anna", lastName: "Schmidt", username: "anna.schmidt", jobTitle: "Geschäftsführerin", department: "MGMT", company: "RWH", managerUsername: null, groups: ["ADMIN", "MANAGER"] },
  { firstName: "Jonas", lastName: "Weber", username: "jonas.weber", jobTitle: "Head of HR", department: "HR", company: "RWH", managerUsername: "anna.schmidt", groups: ["HR", "MANAGER"] },
  { firstName: "Lea", lastName: "Fischer", username: "lea.fischer", jobTitle: "Sales Manager", department: "SALES", company: "RWS", managerUsername: "anna.schmidt", groups: ["SALES", "MANAGER"] },
  { firstName: "Murat", lastName: "Yılmaz", username: "murat.yilmaz", jobTitle: "Head of After-Sales", department: "AFTERSALES", company: "RWK", managerUsername: "anna.schmidt", groups: ["AFTERSALES", "MANAGER"] },
  { firstName: "Sophie", lastName: "Becker", username: "sophie.becker", jobTitle: "Head of Accounting", department: "ACCOUNTING", company: "RWH", managerUsername: "anna.schmidt", groups: ["ACCOUNTING", "MANAGER"] },
  { firstName: "Tim", lastName: "Hoffmann", username: "tim.hoffmann", jobTitle: "Service Technician", department: "FIELD", company: "RWK", managerUsername: "murat.yilmaz", groups: [] },
];

const FIRST = ["Lukas", "Mia", "Paul", "Emma", "Felix", "Hannah", "Leon", "Lena", "Noah", "Marie", "Elias", "Clara", "Finn", "Laura", "Ben", "Julia", "Max", "Sarah", "David", "Nina", "Can", "Aylin", "Mehmet", "Zeynep", "Piotr", "Katarzyna", "Luca", "Giulia", "Jan", "Ida", "Tobias", "Johanna", "Moritz", "Lina", "Niklas", "Theresa"];
const LAST = ["Müller", "Schneider", "Wagner", "Schulz", "Koch", "Richter", "Klein", "Wolf", "Schröder", "Neumann", "Schwarz", "Zimmermann", "Braun", "Krüger", "Hofmann", "Hartmann", "Lange", "Werner", "Krause", "Lehmann", "Köhler", "Kaya", "Demir", "Nowak", "Kowalski", "Rossi", "Vogel", "Jung", "Keller", "Günther"];

const TITLES: Record<Dept, string[]> = {
  MGMT: ["Assistant to Management"],
  HR: ["HR Generalist", "Payroll Specialist", "Recruiter"],
  SALES: ["Sales Representative", "Energy Consultant", "Inside Sales"],
  AFTERSALES: ["Customer Service Agent", "Service Coordinator", "Warranty Specialist"],
  ACCOUNTING: ["Accountant", "Accounts Receivable Clerk", "Controller"],
  FIELD: ["Service Technician", "Heating Engineer", "Electrician", "Solar Installer"],
};
const DEPT_SIZE: Record<Dept, number> = { MGMT: 1, HR: 3, SALES: 10, AFTERSALES: 9, ACCOUNTING: 4, FIELD: 27 };
const DEPT_HEAD: Record<Dept, string> = { MGMT: "anna.schmidt", HR: "jonas.weber", SALES: "lea.fischer", AFTERSALES: "murat.yilmaz", ACCOUNTING: "sophie.becker", FIELD: "murat.yilmaz" };
const DEPT_GROUPS: Record<Dept, DirectoryEntry["groups"]> = { MGMT: [], HR: ["HR"], SALES: ["SALES"], AFTERSALES: ["AFTERSALES"], ACCOUNTING: ["ACCOUNTING"], FIELD: [] };

const ascii = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/ı/g, "i").normalize("NFD").replace(/[^a-z]/g, "");

export function demoEmployees(): DemoEmployee[] {
  const r = rng(7);
  const used = new Set(KEY_PEOPLE.map((p) => p.username));
  const people: DemoEmployee[] = KEY_PEOPLE.map((p, i) => ({ ...p, personnelNo: `P${String(1001 + i)}`, hireDate: `20${String(12 + i).padStart(2, "0")}-0${(i % 9) + 1}-01` }));
  let n = people.length;
  for (const dept of Object.keys(DEPT_SIZE) as Dept[]) {
    for (let i = 0; i < DEPT_SIZE[dept]; i++) {
      let first: string, last: string, username: string;
      do {
        first = r.pick(FIRST);
        last = r.pick(LAST);
        username = `${ascii(first)}.${ascii(last)}`;
      } while (used.has(username));
      used.add(username);
      people.push({
        personnelNo: `P${1001 + n++}`,
        firstName: first,
        lastName: last,
        username,
        jobTitle: r.pick(TITLES[dept]),
        department: dept,
        company: dept === "FIELD" ? r.pick(["RWH", "RWS", "RWE", "RWK"] as const) : dept === "SALES" ? r.pick(["RWH", "RWS", "RWE"] as const) : dept === "AFTERSALES" ? "RWK" : "RWH",
        managerUsername: DEPT_HEAD[dept],
        hireDate: `${r.int(2014, 2025)}-${String(r.int(1, 12)).padStart(2, "0")}-01`,
        groups: DEPT_GROUPS[dept],
      });
    }
  }
  return people;
}

export const DEMO_PASSWORD = "kompass";

export const DEMO_DIRECTORY: DirectoryEntry[] = demoEmployees().map((e) => ({
  username: e.username,
  password: DEMO_PASSWORD,
  displayName: `${e.firstName} ${e.lastName}`,
  mail: `${e.username}@rheinwerk.de`,
  groups: e.groups,
}));

export const CUSTOMER_NAMES = {
  business: ["Bäckerei Hansen", "Hotel am Dom", "Kita Sonnenschein", "Praxis Dr. Albers", "Blumenladen Flora", "Brauhaus Sünner Eck", "Café Rheinblick", "Schreinerei Holzwerk", "Fitnessstudio PowerHouse", "Steuerkanzlei Berg & Partner", "Galerie Ehrenfeld", "Druckerei Kolibri", "Pflegedienst Lebensfreude", "Sportverein Blau-Weiß", "Architekturbüro Linea"],
  public: ["Stadt Köln – Schulamt", "Gemeinde Odenthal", "Stadtwerke Leverkusen", "Kreisverwaltung Rhein-Berg", "Grundschule Nippes"],
};
export const STREETS = ["Aachener Str.", "Venloer Str.", "Bonner Str.", "Neusser Str.", "Dürener Str.", "Luxemburger Str.", "Berliner Str.", "Hauptstr.", "Kölner Str.", "Bergische Landstr."];
export const PLACES = [
  ["50667", "Köln"], ["50672", "Köln"], ["50733", "Köln"], ["50823", "Köln"], ["50937", "Köln"], ["51063", "Köln"], ["51105", "Köln"],
  ["51373", "Leverkusen"], ["51379", "Leverkusen"], ["51429", "Bergisch Gladbach"], ["51465", "Bergisch Gladbach"], ["50226", "Frechen"], ["50354", "Hürth"], ["51519", "Odenthal"],
] as const;

export const DEAL_TOPICS: Record<string, string[]> = {
  RWH: ["Heat pump installation", "Gas boiler replacement", "Underfloor heating", "Bathroom renovation", "Hydraulic balancing"],
  RWS: ["Rooftop PV system", "PV + battery storage", "Wallbox installation", "Balcony power plant", "PV for commercial roof"],
  RWE: ["Electrical renovation", "Smart home wiring", "Fuse box upgrade", "EV charging infrastructure", "Lighting retrofit"],
};

export const TICKET_SUBJECTS = [
  "Heating not warming up", "Error code F28 on boiler", "Inverter shows fault", "Battery storage not charging", "Wallbox won't start charging",
  "Radiator noise", "Hot water lukewarm", "Annual maintenance appointment", "Question about invoice", "PV yield lower than expected",
  "Fuse trips repeatedly", "Smart thermostat offline", "Water leak at heat pump", "Request for warranty repair", "App shows no data",
];
