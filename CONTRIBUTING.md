# Contributing to Kompass

## Workflow

1. **Branch from `main`** using a prefix that says what the change is:
   `feature/…`, `fix/…`, `chore/…`, `docs/…`. One topic per branch.
2. **Commit in small steps** with [Conventional Commits](https://www.conventionalcommits.org/):
   `feat(hr): …`, `fix(api): …`, `test(web): …`, `docs: …`. Explain *why* in the body when it isn't obvious.
3. **Open a pull request** early (draft is fine). The template asks for the change, how it was tested,
   and the data-protection impact.
4. **CI must be green**: lint, typecheck, API tests, web tests, Playwright end-to-end with accessibility checks.
5. **One approving review** from a code owner (see `.github/CODEOWNERS`). Reviewers check behaviour,
   tests, security (RBAC, input validation, personal data) and readability.
6. **Merge with a merge commit** (`--no-ff`) so feature history stays visible; delete the branch.
7. `main` is always deployable; merging to `main` deploys to staging automatically.

## Local setup

See the README. In short: `npm install`, `npm run dev:services`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`.

## Definition of done

- Behaviour covered by tests at the right level (unit / API / component / end-to-end).
- New endpoints are role-checked on the server and documented in `apps/api/src/openapi.ts`.
- UI text exists in German and English (`apps/web/src/lib/i18n.tsx`) and works with keyboard and screen reader.
- Personal data: is it needed, who can see it, is access audited, does retention apply? Update `docs/gdpr.md`.
- Schema changes come with a Prisma migration (`npm -w apps/api run db:migrate:dev -- --name …`);
  analytics changes update `apps/api/sql/` and `docs/data-model.md`.

## Code style

TypeScript strict everywhere, Prettier formatting, ESLint (`npm run lint`). Prefer small, named functions
over clever one-liners, and comments that explain *why* rather than *what*.

## AI-assisted development

Tools such as Claude Code and GitHub Copilot are welcome for drafting code, tests and docs. The author stays
responsible: read every line, run the tests, and never paste production personal data into prompts.
