import { Client, InvalidCredentialsError } from "ldapts";
import { config } from "../config";

export interface DirectoryUser {
  dn: string;
  username: string;
  displayName: string;
  email: string;
  groups: string[];
}

/** RFC 4515 filter escaping, so a username can't inject LDAP filter syntax. */
export function escapeFilter(value: string) {
  return value.replace(/[\\*()\0]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

const first = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? "") : v === undefined ? "" : String(v));
const all = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)]);

/**
 * Standard AD login flow:
 * 1. bind with the service account and look the user up by sAMAccountName,
 * 2. bind again as the found DN with the user's password to verify it,
 * 3. return profile + memberOf groups (mapped to roles by the caller).
 * Returns null for unknown users and wrong passwords alike.
 */
export async function authenticate(username: string, password: string): Promise<DirectoryUser | null> {
  if (!username || !password) return null; // an empty password would be an anonymous bind on many servers
  const c = config();
  const client = new Client({ url: c.LDAP_URL, timeout: c.LDAP_TIMEOUT_MS, connectTimeout: c.LDAP_TIMEOUT_MS });
  try {
    await client.bind(c.LDAP_BIND_DN, c.LDAP_BIND_PASSWORD);
    const { searchEntries } = await client.search(c.LDAP_BASE_DN, {
      scope: "sub",
      filter: c.LDAP_USER_FILTER.replace("{{username}}", escapeFilter(username)),
      attributes: ["dn", "sAMAccountName", "displayName", "mail", "memberOf", "userAccountControl"],
      sizeLimit: 2,
    });
    if (searchEntries.length !== 1) return null;
    // Attribute names are case-insensitive in LDAP; normalise so "sAMAccountName" and "samaccountname" both work.
    const raw = searchEntries[0]!;
    const entry = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v])) as Record<string, unknown> & { dn: string };
    // userAccountControl bit 2 = ACCOUNTDISABLE
    if (Number(first(entry.useraccountcontrol)) & 2) return null;

    const userClient = new Client({ url: c.LDAP_URL, timeout: c.LDAP_TIMEOUT_MS, connectTimeout: c.LDAP_TIMEOUT_MS });
    try {
      await userClient.bind(entry.dn, password);
    } catch (err) {
      if (err instanceof InvalidCredentialsError) return null;
      throw err;
    } finally {
      await userClient.unbind().catch(() => {});
    }
    return {
      dn: entry.dn,
      username: first(entry.samaccountname).toLowerCase() || username,
      displayName: first(entry.displayname) || username,
      email: first(entry.mail),
      groups: all(entry.memberof),
    };
  } finally {
    await client.unbind().catch(() => {});
  }
}
