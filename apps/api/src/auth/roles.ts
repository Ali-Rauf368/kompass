import { config } from "../config";
import type { Role } from "../generated/prisma/client";

export const ROLES = ["ADMIN", "HR", "SALES", "AFTERSALES", "ACCOUNTING", "MANAGER", "EMPLOYEE"] as const satisfies readonly Role[];

/** Maps AD group DNs to Kompass roles. Everyone who can log in is at least an EMPLOYEE. */
export function rolesForGroups(groups: string[]): Role[] {
  const map = config().LDAP_GROUP_ROLE_MAP;
  const roles = new Set<Role>(["EMPLOYEE"]);
  for (const g of groups) {
    const role = map[g.toLowerCase()];
    if (role && (ROLES as readonly string[]).includes(role)) roles.add(role as Role);
  }
  return ROLES.filter((r) => roles.has(r));
}
