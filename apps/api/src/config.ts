import { z } from "zod";

const roleMap = z
  .string()
  .default("")
  .transform((raw) =>
    // "CN=Kompass-Admins,OU=Groups,DC=rheinwerk,DC=local=ADMIN;CN=HR,...=HR"
    Object.fromEntries(
      raw
        .split(";")
        .map((pair) => pair.trim())
        .filter(Boolean)
        .map((pair) => {
          const i = pair.lastIndexOf("=");
          return [pair.slice(0, i).toLowerCase(), pair.slice(i + 1).toUpperCase()];
        }),
    ) as Record<string, string>,
  );

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4100),
  DATABASE_URL: z.string().url(),
  MONGO_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  SESSION_HOURS: z.coerce.number().default(10),
  CORS_ORIGIN: z.string().default("http://localhost:5190"),
  TRUST_PROXY: z.string().optional(),
  LDAP_URL: z.string().default("ldap://localhost:3890"),
  LDAP_BIND_DN: z.string().default("CN=svc-kompass,OU=Service Accounts,DC=rheinwerk,DC=local"),
  LDAP_BIND_PASSWORD: z.string().default("svc-password"),
  LDAP_BASE_DN: z.string().default("OU=Users,DC=rheinwerk,DC=local"),
  /** {{username}} is replaced with the escaped login name. */
  LDAP_USER_FILTER: z.string().default("(&(objectClass=user)(sAMAccountName={{username}}))"),
  LDAP_GROUP_ROLE_MAP: roleMap,
  LDAP_TIMEOUT_MS: z.coerce.number().default(5000),
  INGEST_API_KEY: z.string().min(16),
  LOGIN_RATE_LIMIT: z.coerce.number().default(10),
  AUDIT_RETENTION_DAYS: z.coerce.number().default(400),
  LEAVE_RETENTION_YEARS: z.coerce.number().default(3),
});

export type Config = z.infer<typeof schema>;

/** Parsed lazily so tests can set process.env before the first import of the app. */
let cached: Config | undefined;
export function config(): Config {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
      throw new Error(`Invalid configuration:\n  ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Test helper: change a value for the rest of the process. */
export function overrideConfig(patch: Partial<Config>) {
  cached = { ...config(), ...patch };
}
