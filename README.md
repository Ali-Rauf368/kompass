# Kompass

Kompass is the internal operations platform of the Rheinwerk Gruppe. It brings our four companies (Haustechnik, Solar, Elektro and Kundenservice) into one place, so people stop jumping between the ERP, the CRM, spreadsheets and email to get their work done.

What you can do in it today:

- **People**: employee directory, profiles and leave requests with approval.
- **Sales**: deal pipeline and customer records.
- **After-sales**: service tickets with SLA tracking.
- **Accounting**: invoices, open receivables and DSO.
- **Dashboard**: the key numbers across all companies, updated live.
- **Admin**: audit log, data pipelines and GDPR tools.

What you see depends on your role. Someone in HR gets the HR pages, a technician gets the basics, and admins see everything. The API checks roles on every request, so hiding a menu item is never the only protection.

## How it's built

It's a TypeScript monorepo with three workspaces:

| Folder | What it is |
|---|---|
| `apps/api` | Express API. PostgreSQL via Prisma for business data and analytics, MongoDB for the audit log and notifications, WebSockets for live updates |
| `apps/web` | React + Vite + Tailwind frontend, in English and German, with light and dark mode |
| `e2e` | Playwright end-to-end tests, including accessibility checks |

Login normally goes through the company's Active Directory over LDAP, and AD groups decide your roles. People without an AD account can also sign up on the login page. Those accounts get the basic Employee role, and their passwords are stored as scrypt hashes.

Other folders: `infra/` has Docker, nginx, systemd units and the deploy/backup scripts; `nifi/` has the flows that push ERP/CRM data into the API; `docs/adr/` explains the bigger design decisions and why we made them.

## Running it locally

You need **Node.js 24** or newer and a local **PostgreSQL 16** install. MongoDB and a mock Active Directory are started for you, so Docker isn't needed.

```bash
npm install
cp apps/api/.env.example apps/api/.env   # the defaults work for local development
npm run dev:services                     # Postgres :5434, MongoDB :27018, mock AD :3890
npm run db:migrate
npm run db:seed                          # sample companies, people, deals, tickets, invoices
npm run dev                              # API on :4100, web on :5190
```

Then open **http://localhost:5190**.

After the first time, `npm run dev` is all you need, because it starts the services too. When you're done, press Ctrl+C and run `npm run stop:services`.

### Demo accounts

Every demo account uses the password **`kompass`**:

| Username | Role |
|---|---|
| `anna.schmidt` | Admin / management (sees everything) |
| `jonas.weber` | HR |
| `lea.fischer` | Sales |
| `murat.yilmaz` | Customer service |
| `sophie.becker` | Accounting |
| `tim.hoffmann` | Technician |

On the login page you can click any of them to fill in the form, or create your own account at `/signup`.

The API docs (Swagger) are at **http://localhost:4100/api/docs**.

### "Port already in use"?

An earlier dev server is still running. Stop it and start again:

```bash
kill $(lsof -ti tcp:4100,5190 -sTCP:LISTEN)
npm run dev
```

## Useful commands

```bash
npm test             # API tests (against throwaway databases) + web tests
npm run test:e2e     # Playwright end-to-end tests
npm run lint         # ESLint
npm run typecheck    # TypeScript across all workspaces
npm run build        # production build of API and web
```

## Deploying

`main` is always deployable, and merging into it deploys to staging. On the server, `infra/deploy.sh` takes a backup, pulls the new images, runs migrations, restarts and then checks `/api/health`. If the health check fails, the script exits with an error.

## Contributing

Branch from `main`, keep commits small, and open a pull request. CONTRIBUTING.md covers the details: branch names, commit style, what reviewers look for, and our checklist for personal data.
