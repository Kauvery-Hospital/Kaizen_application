# Setup and configuration

## Prerequisites

- **Node.js** (LTS recommended) matching the toolchain used in `frontend/package.json` and `backend/package.json`
- **PostgreSQL** reachable from the API host
- Optional: **Google GenAI** API access if you use `/ai/*` routes

## Backend

Location: `backend/`.

### Environment

Create `backend/.env` (not committed) with at least:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string for Prisma |
| `JWT_SECRET` (or as used in `AuthModule`) | Signing key for access tokens — confirm exact name in `backend/src/modules/auth/` factory |
| `PORT` | HTTP listen port (defaults to **3000** in `configuration.ts`) |
| `KAIZEN_UPLOAD_ROOT` | Absolute filesystem path for kaizen file storage (defaults to `uploads/kaizen_storage` under cwd) |

Additional variables may be required for HRMS connectivity, AI, or email — inspect `backend/src/config` and module `registerAsync` blocks for your deployment.

### Commands

```bash
cd backend
npm install
npx prisma migrate dev
npm run start:dev
```

Common Prisma scripts (see `package.json`):

- `npm run prisma:generate` — regenerate client
- `npm run prisma:migrate` — apply migrations in dev
- `npm run prisma:studio` — open Prisma Studio
- `npm run prisma:seed` — run `prisma/seed.ts`

Production entry: `npm run start:prod` → `node dist/main.js` after `npm run build`.

## Frontend

Location: `frontend/`.

```bash
cd frontend
npm install
npm run dev
```

Vite dev server port is printed in the terminal (default **5173** unless configured). Point the UI at your API base URL according to your environment (env file or Vite `define` / proxy — check `frontend/vite.config.ts` if present).

## File uploads

Uploaded kaizen files live under `KAIZEN_UPLOAD_ROOT`, organized per employee code (see `AttachmentsService`). The API exposes them at **`/kaizen-files/<relative path>`**.

## JSON limits

Large **rendered PPTX** payloads use a **50mb** Express JSON parser limit (`main.ts`).

## Scheduled jobs

`ScheduleModule.forRoot()` is enabled. Inspect `HrmsSyncService`, `MobileIdeasSyncService`, or other `@Cron` providers for exact schedules and toggles.

## Security checklist for deployments

- Enforce HTTPS at the edge (reverse proxy).
- Rotate `JWT_SECRET` and invalidate old tokens on compromise.
- Restrict admin sync endpoints to trusted networks or additional auth if needed.
- Keep upload directory **outside** web-public roots except via controlled `/kaizen-files` middleware.
