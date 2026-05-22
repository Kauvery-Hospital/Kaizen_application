# Database schema (table structure)

The canonical definition is **`backend/prisma/schema.prisma`**. The database provider is **PostgreSQL**.

Below, **Model** is the Prisma name; **`@@map`** is the physical table name when present.

## Core identity and access control

### `User` → table `users`

| Field (logical) | DB column | Notes |
|-----------------|-----------|--------|
| `id` | `id` | CUID primary key |
| `employeeCode` | `employee_code` | Unique, used at login |
| `email` | `email` | Unique |
| `name` | `name` | Display name |
| `department` | `department` | Optional text |
| `designation` | `designation` | Optional text |
| `isActive` | `is_active` | Soft-disable login |
| `lastLoginAt` | `last_login_at` | Updated on successful login |
| `password` | `password` | Bcrypt (legacy MD5/plain supported in auth service with migration) |
| `createdAt` / `updatedAt` | `created_at` / `updated_at` | Timestamps |

Relations: `roles` (via `UserRoleMapping`), `unitScopes`, `departmentHodAssignments`.

### `Role` → table `roles`

Lookup of role definitions. `code` uses enum **`RoleCode`** (see enums below).

### `UserRoleMapping` → table `user_role_mapping`

Many-to-many between `users` and `roles` with `assigned_by`, `assigned_at`.

### `UserRoleUnitScope` → table `user_role_unit_scope`

Per-user, per-role, per-**unit code** scope rows (used for coordinators, heads, etc.).

### `DepartmentHodAssignment` → table `department_hod_assignment`

Maps a user as department-level HOD for a **unit + department name** pair (supports UC Level-1 routing).

## Kaizen domain

### `Suggestion` → table `suggestions`

Primary Kaizen record. Notable columns:

- **Identity** — `id`, unique human-readable `code`, `source` (`PORTAL` | `MOBILE`), optional `source_id` (unique with `source` for deduplication).
- **Idea content** — `theme`, `unit`, `area`, `department`, `date_submitted`, `employee_name`, `description`, optional `category` (clinical/supportive style reporting).
- **Workflow** — `status` (string mirroring `AppStatus` labels), `current_stage_role`, `workflow_thread` (JSON array of events), `comments` (JSON).
- **Screening / coordination** — `screening_notes`, `coordinator_suggestion`.
- **Assignment** — `assigned_implementer`, `assigned_implementer_code`, `assigned_unit`, `assigned_department`, deadline fields, `implementation_stage`, `implementation_progress`, `implementation_update`, etc.
- **Approvals** — `required_approvals` (JSON array of role display strings), `hod_approver_names` (JSON), `approval_phase` (`L1` / `L2` / null), `department_approvals` (JSON slots with timestamps), `approvals` (JSON map of functional head sign-offs).
- **BE / rewards** — `reward_evaluation` (JSON), `be_review_notes`, `be_edited_fields` (JSON).
- **Implementation template** — `implementation_draft`, `extra_slides` (JSON).
- **Attachments** — `idea_attachments_folder`, `idea_attachment_paths`, `template_attachments_folder`, `template_attachment_paths` (relative to upload root).
- **HR closure** — `hr_reward_validation_image_path` (required before `REWARDED` in service rules).

Indexes exist on `department`, `employee_name`, `status`, `current_stage_role`, `assigned_implementer_code`.

### `ImplementedKaizen` → table `implemented_kaizen`

One-to-one extension of a suggestion when the workflow reaches **rewarded / closed**: stores `implemented_code`, `idea_code`, `data_snapshot`, `implemented_at`.

### `CodeCounter` → table `code_counters`

Yearly sequence counter for generated codes (`prefix`, `year`, `next`).

## HRMS staging and mirror tables

### `HrmsEmployeeStaging` → `hrms_employee_staging`

Rows staged from HRMS employee feed before or during sync into portal `users`.

### `HrmsSyncLog` → `hrms_sync_log`

Audit of sync runs: timestamps, `source` (`EMPLOYEE` | `SUGGESTION`), `status` (`SUCCESS` | `FAILED`), counts, `error_message`.

### `HrmsSuggestion` → `hrms_suggestions`

Mobile/HRMS-side suggestion text and metadata (UUID id).

### `hrms_employees` (Prisma model `hrms_employees`)

Lowercase model name mapping to table **`hrms_employees`**: rich employee mirror used for directory queries and department-for-unit union logic.

### `HrmsUnit` → `hrms_units`, `HrmsDepartment` → `hrms_departments`

Master lists for unit codes/names and department names.

## Enums (Postgres / Prisma)

- **`SuggestionSource`** — `PORTAL`, `MOBILE`
- **`RoleCode`** — `EMPLOYEE`, `UNIT_COORDINATOR`, `SELECTION_COMMITTEE`, `IMPLEMENTER`, `BUSINESS_EXCELLENCE`, `BUSINESS_EXCELLENCE_HEAD`, `HOD_FINANCE`, `HOD_HR`, `HOD_QUALITY`, `HOD_OPS`, `HOD_NURSING`, `ADMIN`, `SUPER_ADMIN`, `BE_MEMBER`, `BE_HEAD`
- **`SyncStatus`** — `SUCCESS`, `FAILED`
- **`HrmsSyncSource`** — `EMPLOYEE`, `SUGGESTION`

## ER-style relationships (text)

- `User` 1—N `UserRoleMapping` N—1 `Role`
- `User` 1—N `UserRoleUnitScope`
- `User` 1—N `DepartmentHodAssignment`
- `Suggestion` 1—0..1 `ImplementedKaizen` (cascade on delete from suggestion side per FK definition)

For exact FK names and cascades, see `schema.prisma` `@relation` blocks.
