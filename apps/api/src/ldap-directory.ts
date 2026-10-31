/**
 * A small Active Directory look-alike for development and tests, built on ldapjs' server.
 * Supports what Kompass uses: simple bind, subtree search with AD-style attributes
 * (sAMAccountName, memberOf, userAccountControl). Not for production.
 */
import ldap from "ldapjs";

// @types/ldapjs only describes the client; these are the bits of the server API used here.
interface BindReq { dn: { toString(): string }; credentials: string }
interface SearchReq { filter: { matches(attrs: Record<string, unknown>): boolean }; connection: { ldap: { bindDN: { toString(): string } } } }
interface Res { attributes: string[]; end(): void; send(entry: { dn: string; attributes: Record<string, unknown> }, noFiltering?: boolean): void }
type Next = (err?: unknown) => void;
interface LdapServer {
  bind(base: string, ...handlers: ((req: BindReq, res: Res, next: Next) => void)[]): void;
  search(base: string, ...handlers: ((req: SearchReq, res: Res, next: Next) => void)[]): void;
  listen(port: number, host: string, cb: () => void): void;
  close(cb: () => void): void;
  address(): { port: number };
}

export const BASE = "DC=rheinwerk,DC=local";
export const USERS_OU = `OU=Users,${BASE}`;
export const GROUPS_OU = `OU=Groups,${BASE}`;
export const SERVICE_DN = `CN=svc-kompass,OU=Service Accounts,${BASE}`;

export const GROUPS = {
  ADMIN: `CN=Kompass-Admins,${GROUPS_OU}`,
  HR: `CN=Kompass-HR,${GROUPS_OU}`,
  SALES: `CN=Kompass-Sales,${GROUPS_OU}`,
  AFTERSALES: `CN=Kompass-AfterSales,${GROUPS_OU}`,
  ACCOUNTING: `CN=Kompass-Accounting,${GROUPS_OU}`,
  MANAGER: `CN=Kompass-Managers,${GROUPS_OU}`,
} as const;

/** The value for LDAP_GROUP_ROLE_MAP that matches the groups above. */
export const DEV_ROLE_MAP = Object.entries(GROUPS)
  .map(([role, dn]) => `${dn}=${role}`)
  .join(";");

export interface DirectoryEntry {
  username: string;
  password: string;
  displayName: string;
  mail: string;
  groups: (keyof typeof GROUPS)[];
  disabled?: boolean;
}

export function startDirectory(entries: DirectoryEntry[], opts: { port: number; servicePassword: string }) {
  const server = ldap.createServer() as unknown as LdapServer;
  const norm = (dn: string) => dn.replace(/\s/g, "").toLowerCase();
  const users = new Map(entries.map((e) => [norm(`CN=${e.username},${USERS_OU}`), { dn: `CN=${e.username},${USERS_OU}`, ...e }]));

  server.bind(SERVICE_DN, (req: BindReq, res: Res, next: Next) => {
    if (req.credentials !== opts.servicePassword) return next(new ldap.InvalidCredentialsError());
    res.end();
    next();
  });

  server.bind(USERS_OU, (req: BindReq, res: Res, next: Next) => {
    const user = users.get(norm(req.dn.toString()));
    if (!user || user.disabled || req.credentials !== user.password) return next(new ldap.InvalidCredentialsError());
    res.end();
    next();
  });

  const requireServiceBind = (req: SearchReq, _res: Res, next: Next) => {
    if (norm(req.connection.ldap.bindDN.toString()) !== norm(SERVICE_DN)) return next(new ldap.InsufficientAccessRightsError());
    next();
  };

  server.search(USERS_OU, requireServiceBind, (req: SearchReq, res: Res, next: Next) => {
    // ldapjs 3 compares lowercased attribute names against the requested names as sent
    // ("sAMAccountName"), so mixed-case attributes would be dropped. Lowercase the request list.
    res.attributes = res.attributes.map((a) => a.toLowerCase());
    for (const u of users.values()) {
      const attributes = {
        objectClass: ["top", "person", "organizationalPerson", "user"],
        cn: u.username,
        sAMAccountName: u.username,
        displayName: u.displayName,
        mail: u.mail,
        memberOf: u.groups.map((g) => GROUPS[g]),
        userAccountControl: String(u.disabled ? 514 : 512),
      };
      if (req.filter.matches(attributes)) res.send({ dn: u.dn, attributes });
    }
    res.end();
    next();
  });

  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    server.listen(opts.port, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({ url: `ldap://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}
