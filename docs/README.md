# Kaizen application documentation

This folder describes the **Kaizen_application** monorepo: a React (Vite) frontend and a NestJS backend backed by PostgreSQL (Prisma).

## Contents

| Document | Description |
|----------|-------------|
| [architecture.md](./architecture.md) | System layers, modules, integrations, and how pieces fit together |
| [database-schema.md](./database-schema.md) | Prisma models, enums, and physical table names |
| [workflow.md](./workflow.md) | Kaizen lifecycle, statuses, roles, and approval phases |
| [api.md](./api.md) | HTTP API reference (routes, auth, query/body patterns) |
| [setup-and-configuration.md](./setup-and-configuration.md) | Environment variables, ports, uploads, and common commands |

## Repository layout (high level)

- **`frontend/`** — React 19 SPA (`vite`), dashboards, forms, reports UI
- **`backend/`** — NestJS 11 API, Prisma, JWT auth, file uploads, scheduled jobs
- **`backend/prisma/`** — Schema, migrations, seed

For implementation details, prefer reading the referenced source files alongside these summaries.
