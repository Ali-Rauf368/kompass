# ADR 0003: Active Directory login with server-side role mapping and cookie sessions

**Status:** accepted

## Context

Everyone already has a Windows (AD) account. Roles should follow AD group membership managed by IT.

## Decision

Login binds against AD (service bind → user search → user bind). AD groups are mapped to Kompass roles via
`LDAP_GROUP_ROLE_MAP`. The API issues a signed session in an `httpOnly`, `SameSite=Lax` cookie;
state-changing requests must carry `X-Kompass-Client: web` (CSRF defence). Roles are re-read at every login.

## Consequences

- No passwords stored in Kompass; disabling an AD account blocks the next login.
- Role changes in AD take effect at the next login (sessions last `SESSION_HOURS`, default 10 h).
- For local development and tests a mock directory (`src/ldap-directory.ts`) imitates AD.
