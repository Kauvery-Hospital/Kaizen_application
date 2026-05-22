# API reference

Unless deployed behind a reverse path prefix, routes are served from the **NestJS app root** (no global `/api` prefix in `main.ts`).

## Authentication

Most endpoints require:

```http
Authorization: Bearer <access_token>
```

### `POST /auth/login`

Public. Body (`LoginDto`):

| Field | Type | Required |
|-------|------|----------|
| `employeeCode` | string | yes |
| `password` | string | yes |

**Response** — `{ accessToken, user }` where `user` includes `id`, `employeeCode`, `email`, `name`, `roles` (string `RoleCode[]`), and `departmentHodAssignments` (string[]).

### `POST /auth/refresh-session`

Requires JWT. Returns a fresh `{ accessToken, user }` payload.

## Health

### `GET /health`

Public. Returns `{ status: 'ok', timestamp: ISO string }`.

## Root

### `GET /`

Public hello string from `AppController` (sanity check).

---

## Suggestions (`JwtAuthGuard` on controller)

Base path: **`/suggestions`**.

### `POST /suggestions`

Create Kaizen. Body: `CreateSuggestionDto` — optional fields include `theme`, `unit`, `area`, `department`, `employeeName`, `description`, `expectedBenefits`, `data`, `actorName`, `ideaAttachmentsFolder`, `ideaAttachmentPaths`. Server fills actor/employee from JWT when omitted.

### `GET /suggestions`

List suggestions visible to the caller. Query (`ListSuggestionsQueryDto`):

| Query | Description |
|-------|-------------|
| `role` | Optional `AppRole` enum value; must be one of the caller’s allowed roles or it falls back to first allowed |
| `currentUserName` | Optional override for name-based filters |

### `GET /suggestions/be-report`

Business Excellence report. Query: `BeReportQueryDto` (pagination/filter fields — see DTO file). **Forbidden** unless token roles map to BE member/head.

### `GET /suggestions/:id`

Single suggestion by id (includes `implementedKaizen` summary fields when present).

### `GET /suggestions/:id/pptx`

Downloads **server-built** PPTX (`Content-Disposition: attachment`).

### `POST /suggestions/:id/pptx/rendered`

Body: `{ slides?: string[] (base64), fileNameBase?: string }` — builds PPTX from **client-rendered** slides (large payload; 50mb JSON limit).

### `POST /suggestions/:id/template/finalize`

Body: same shape as rendered export — persists finalized template assets via `PptxExportService.finalizeTemplateAssets`.

### `POST /suggestions/:id/hr-reward-validation`

`multipart/form-data` field **`file`** (image). Uploads HR reward proof; max **20MB** per file.

### `PATCH /suggestions/:id/status`

Body: `UpdateSuggestionStatusDto`:

```json
{
  "actor": { "name": "string", "role": "<AppRole enum>", "employeeCode": "optional" },
  "status": "<AppStatus enum>",
  "extraData": {}
}
```

`extraData` carries structured updates (approvals, assignment fields, theme, notes, etc.). The service sanitizes and validates transitions.

---

## Users (`JwtAuthGuard` + `TokenRolesGuard` where noted)

Base path: **`/users`**.

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/users/me` | any authenticated | Current profile |
| `GET` | `/users/implementers` | Selection Committee, Admin, Super Admin | Query: `unitCode`, `department` |
| `GET` | `/users/unit-scoped-hods` | Unit Coordinator, Admin, Super Admin | Query: `unitCode`, `roleCode` |
| `GET` | `/users/unit-department-members` | Unit Coordinator, Admin, Super Admin | Query: `unitCode`, `department` |
| `GET` | `/users/hrms/:employeeId` | any authenticated | HRMS mirror lookup |
| `GET` | `/users/summary` | Admin, Super Admin | Aggregate counts |
| `GET` | `/users` | Admin, Super Admin | Paginated directory; query: `search`, `department`, `includeUnitScopes`, `skip`, `take`, `role`, `isActive` |
| `POST` | `/users/:userId/roles` | Admin, Super Admin | `AssignRoleDto` |
| `DELETE` | `/users/:userId/roles/:roleCode` | Admin, Super Admin | Remove mapping |
| `GET` | `/users/:userId/unit-scopes` | Admin, Super Admin | Query: `roleCode` |
| `POST` | `/users/:userId/unit-scopes` | Admin, Super Admin | `SetUnitScopesDto` |
| `GET` | `/users/:userId/department-hod-scopes` | Admin, Super Admin | Query: `department` |
| `POST` | `/users/:userId/department-hod-scopes` | Admin, Super Admin | `SetDepartmentHodScopesDto` |
| `DELETE` | `/users/:userId/department-hod-scopes` | Admin, Super Admin | Query: `department` |

---

## HRMS master data (`JwtAuthGuard`)

Base path: **`/hrms`**.

| Method | Path | Query | Description |
|--------|------|-------|-------------|
| `GET` | `/hrms/units` | `q` optional | Search units (limit 500) |
| `GET` | `/hrms/departments` | `q` optional | Search departments (limit 3000) |
| `GET` | `/hrms/departments-for-unit` | `unitCode` optional | Master departments + distinct departments from active `hrms_employees` at unit |

---

## HRMS sync (admin)

### `POST /hrms-sync/run-now`

Roles: **Admin**, **Super Admin**. Triggers `HrmsSyncService.runNow()`.

---

## Mobile ideas sync (admin)

### `POST /mobile-ideas-sync/run-now`

Roles: **Admin**, **Super Admin**. Optional query: `take` (numeric limit).

---

## Attachments (`JwtAuthGuard`)

Base path: **`/attachments`**.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| `POST` | `/attachments/kaizen-idea` | `multipart/form-data` `files[]` | Up to 20 files, **100MB** each (memory storage) |
| `POST` | `/attachments/kaizen-template` | `files[]` | Optional query `suggestionId`, `prefix`; links template to suggestion when id provided |
| `DELETE` | `/attachments/kaizen-file` | — | Query `path` — relative path under employee’s kaizen folder |

Saved files are reachable via **`GET /kaizen-files/...`** (static).

---

## AI (`JwtAuthGuard`)

Base path: **`/ai`**.

| Method | Path | Body |
|--------|------|------|
| `POST` | `/ai/analyze-suggestion` | `AnalyzeSuggestionDto` (`title`, `context`) |
| `POST` | `/ai/evaluate-kaizen` | `EvaluateKaizenDto` (`suggestionData`) — criteria matrix defined server-side |

Requires configured Google GenAI credentials in the runtime environment (see `AiService`).

---

## Reports (`JwtAuthGuard`)

Base path: **`/reports`**.

### `GET /reports`

Query (`ReportsQueryDto`):

| Field | Required | Description |
|-------|----------|-------------|
| `report` | yes | One of the `ReportId` literals (see `reports.types.ts` / DTO `@IsIn` list) |
| `skip` / `take` | no | Pagination integers |
| `q`, `unit`, `department`, `status`, `category` | no | Filters where applicable |
| `from` / `to` | no | `YYYY-MM-DD` date window |
| `includeDetails` | no | boolean-ish |

Returns JSON shaped per report implementation in `ReportsService`.

### `GET /reports/export`

Same query params as `GET /reports`. Response is **XLSX** when `exceljs` resolves; otherwise **CSV** fallback. Filename pattern: `<report>-<YYYY-MM-DD>.xlsx|.csv`.

Report catalog and BE-only policy: `REPORT_CATALOG` in `backend/src/modules/reports/reports.types.ts`.

---

## Error shape

NestJS returns JSON problem bodies with `statusCode`, `message`, and optional `error` for validation failures (`ValidationPipe` with `forbidNonWhitelisted` may reject unknown JSON keys).

## CORS and static downloads

Browser fetches to `/kaizen-files/**` receive `Access-Control-Allow-Origin` mirroring the request `Origin` when present (see `main.ts` middleware).
