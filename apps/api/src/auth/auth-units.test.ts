import { describe, expect, it } from "@jest/globals";
import { escapeFilter } from "./ldap";
import { rolesForGroups } from "./roles";

describe("escapeFilter", () => {
  it("escapes LDAP filter metacharacters (RFC 4515)", () => {
    expect(escapeFilter("*)(uid=*")).toBe("\\2a\\29\\28uid=\\2a");
    expect(escapeFilter("a\\b")).toBe("a\\5cb");
  });

  it("leaves normal usernames untouched", () => {
    expect(escapeFilter("anna.schmidt")).toBe("anna.schmidt");
  });
});

describe("rolesForGroups", () => {
  it("maps AD groups case-insensitively and always includes EMPLOYEE", () => {
    expect(rolesForGroups(["cn=kompass-hr,ou=groups,dc=rheinwerk,dc=local"])).toEqual(["HR", "EMPLOYEE"]);
  });

  it("ignores unknown groups", () => {
    expect(rolesForGroups(["CN=Domain Users,DC=rheinwerk,DC=local"])).toEqual(["EMPLOYEE"]);
  });

  it("returns roles in a stable order", () => {
    expect(rolesForGroups(["CN=Kompass-Managers,OU=Groups,DC=rheinwerk,DC=local", "CN=Kompass-Admins,OU=Groups,DC=rheinwerk,DC=local"])).toEqual(["ADMIN", "MANAGER", "EMPLOYEE"]);
  });
});
