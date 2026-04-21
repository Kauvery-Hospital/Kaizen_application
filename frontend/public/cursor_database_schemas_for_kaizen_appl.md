# Database schemas for kaizen application
_Exported on 3/26/2026 at 10:14:28 GMT+5:30 from Cursor (2.6.20)_

---

**User**

please refer the document in public folder kaizen application. this explains the full flow of the project and please go through all the designs we implemented all the flow. we need to make the databse tables for this application in postgreSQL. please give me the database schemas for full flow

---

**Cursor**

I’ll review the project documentation in the `public` folder first, map the end-to-end flow, and then draft a complete PostgreSQL schema covering all modules and relationships. I’m starting by locating and reading those docs now.

I found the project root and `public` directory; next I’m listing files inside `public` directly to identify the flow/design document you referenced.

I found the document at `public/Kaizen Application.pdf`. I’ll extract it now and derive a full normalized PostgreSQL schema from the complete flow.

Reviewed `public/Kaizen Application.pdf` and mapped the full 9-step workflow.  
Below is a PostgreSQL schema that supports the **entire flow end-to-end** (idea submission -> approvals -> implementation -> BE evaluation -> reward payout -> audit trail).

```sql
-- Recommended extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;

-- =========================
-- MASTER / ORG STRUCTURE
-- =========================
CREATE TABLE units (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                VARCHAR(30) UNIQUE NOT NULL,
  name                VARCHAR(120) UNIQUE NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE departments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                VARCHAR(30) UNIQUE NOT NULL,
  name                VARCHAR(120) UNIQUE NOT NULL,
  is_functional_hod   BOOLEAN NOT NULL DEFAULT FALSE, -- HR/Finance/Quality dept types
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE areas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id             UUID NOT NULL REFERENCES units(id),
  code                VARCHAR(30) NOT NULL,     -- OP/IP/ER/ICU/OT...
  name                VARCHAR(120) NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(unit_id, code),
  UNIQUE(unit_id, name)
);

CREATE TABLE roles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                VARCHAR(40) UNIQUE NOT NULL, -- EMPLOYEE, UNIT_COORDINATOR, etc
  name                VARCHAR(100) NOT NULL
);

CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code       VARCHAR(50) UNIQUE NOT NULL,
  full_name           VARCHAR(150) NOT NULL,
  email               CITEXT UNIQUE NOT NULL,
  mobile              VARCHAR(20),
  unit_id             UUID REFERENCES units(id),
  department_id       UUID REFERENCES departments(id),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id             UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

-- =========================
-- WORKFLOW ENUMS
-- =========================
CREATE TYPE idea_status AS ENUM (
  'IDEA_SUBMITTED',
  'IDEA_REJECTED_BY_COORDINATOR',
  'IDEA_APPROVED_BY_COORDINATOR',
  'ASSIGNED_FOR_IMPLEMENTATION',
  'IMPLEMENTATION_SUBMITTED',
  'VERIFIED_BY_COORDINATOR',
  'UNDER_FUNCTIONAL_REVIEW',
  'FUNCTIONAL_REJECTED',
  'FUNCTIONAL_APPROVED',
  'UNDER_BE_EVALUATION',
  'BE_REJECTED',
  'BE_APPROVED',
  'REWARD_PROCESSING',
  'REWARDED_CLOSED'
);

CREATE TYPE pqcdsem_type AS ENUM (
  'PRODUCTIVITY', 'QUALITY', 'COST', 'DELIVERY', 'SAFETY', 'ENVIRONMENT', 'MORALE'
);

CREATE TYPE functional_review_type AS ENUM ('HR', 'FINANCE', 'QUALITY');
CREATE TYPE approval_decision AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE payment_status AS ENUM ('PENDING', 'PAID');

-- =========================
-- IDEA (PHASE 1 + GLOBAL)
-- =========================
CREATE TABLE ideas (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_reference_no           VARCHAR(40) UNIQUE NOT NULL, -- generated at submission
  kaizen_number               VARCHAR(40) UNIQUE,          -- generated only after BE approval

  title                       VARCHAR(250) NOT NULL,
  short_description           TEXT NOT NULL,

  originator_user_id          UUID NOT NULL REFERENCES users(id),
  originator_unit_id          UUID NOT NULL REFERENCES units(id),
  originator_department_id    UUID NOT NULL REFERENCES departments(id),
  originator_area_id          UUID NOT NULL REFERENCES areas(id),

  current_status              idea_status NOT NULL DEFAULT 'IDEA_SUBMITTED',
  is_edit_locked              BOOLEAN NOT NULL DEFAULT FALSE,

  submitted_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_status_changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE idea_expected_benefits (
  idea_id              UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  benefit              pqcdsem_type NOT NULL,
  PRIMARY KEY (idea_id, benefit)
);

CREATE TABLE files (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key          TEXT NOT NULL,           -- object store path / key
  original_file_name   TEXT NOT NULL,
  mime_type            VARCHAR(150),
  file_size_bytes      BIGINT,
  uploaded_by_user_id  UUID REFERENCES users(id),
  uploaded_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE idea_attachments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id              UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  file_id              UUID NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  attachment_type      VARCHAR(40) NOT NULL DEFAULT 'IDEA_SUBMISSION', -- IDEA_SUBMISSION, BEFORE, AFTER, COUNTERMEASURE
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================
-- APPROVAL / ROUTING / COMMENTS / AUDIT
-- =========================
CREATE TABLE idea_comments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id              UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  author_user_id       UUID NOT NULL REFERENCES users(id),
  author_role_code     VARCHAR(40) NOT NULL,
  comment_text         TEXT NOT NULL,
  is_system_generated  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE idea_status_history (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id              UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  from_status          idea_status,
  to_status            idea_status NOT NULL,
  changed_by_user_id   UUID REFERENCES users(id),
  remarks              TEXT,
  changed_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE idea_assignments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id              UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  assigned_department_id UUID NOT NULL REFERENCES departments(id),
  assigned_implementer_user_id UUID NOT NULL REFERENCES users(id),
  assigned_by_user_id  UUID NOT NULL REFERENCES users(id), -- selection committee
  assigned_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE
);

-- Functional routing chosen by Unit Coordinator post-implementation
CREATE TABLE idea_functional_routing (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id              UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  review_type          functional_review_type NOT NULL, -- HR/Finance/Quality
  routed_by_user_id    UUID NOT NULL REFERENCES users(id),
  routed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idea_id, review_type)
);

CREATE TABLE idea_functional_reviews (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id              UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  review_type          functional_review_type NOT NULL,
  reviewer_user_id     UUID NOT NULL REFERENCES users(id),
  decision             approval_decision NOT NULL DEFAULT 'PENDING',
  remarks              TEXT,
  decided_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idea_id, review_type)
);

-- =========================
-- IMPLEMENTATION (KAIZEN TEMPLATE)
-- =========================
CREATE TABLE kaizen_reports (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id                     UUID UNIQUE NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  implementer_user_id         UUID NOT NULL REFERENCES users(id),

  category                    VARCHAR(20) NOT NULL CHECK (category IN ('CLINICAL', 'NON_CLINICAL')),
  kaizen_theme                VARCHAR(250) NOT NULL, -- auto-filled from idea
  implementation_date         DATE,

  problem_what                TEXT,
  problem_where               TEXT,
  problem_when                TEXT,
  problem_how                 TEXT,
  problem_how_much            TEXT,

  root_cause                  TEXT,
  idea_to_eliminate           TEXT,
  countermeasures_text        TEXT,

  before_description          TEXT,
  after_description           TEXT,

  standardization_opl         BOOLEAN NOT NULL DEFAULT FALSE,
  standardization_sop         BOOLEAN NOT NULL DEFAULT FALSE,
  standardization_manual      BOOLEAN NOT NULL DEFAULT FALSE,
  standardization_others      BOOLEAN NOT NULL DEFAULT FALSE,
  standardization_others_text TEXT,

  horizontal_deployment       BOOLEAN NOT NULL DEFAULT FALSE,
  horizontal_deployment_desc  TEXT,

  submitted_at                TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Why-Why (up to 5 or extendable); app validates max 10 words per row
CREATE TABLE kaizen_why_analysis (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kaizen_report_id     UUID NOT NULL REFERENCES kaizen_reports(id) ON DELETE CASCADE,
  why_sequence         SMALLINT NOT NULL CHECK (why_sequence BETWEEN 1 AND 10),
  why_text             VARCHAR(200) NOT NULL, -- keep short
  UNIQUE (kaizen_report_id, why_sequence)
);

CREATE TABLE kaizen_pqcdsem_impact (
  kaizen_report_id     UUID NOT NULL REFERENCES kaizen_reports(id) ON DELETE CASCADE,
  impact               pqcdsem_type NOT NULL,
  PRIMARY KEY (kaizen_report_id, impact)
);

-- =========================
-- BUSINESS EXCELLENCE EVALUATION
-- =========================
CREATE TABLE be_evaluations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id                   UUID UNIQUE NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  evaluated_by_user_id      UUID NOT NULL REFERENCES users(id),
  approved_by_be_head_id    UUID REFERENCES users(id),

  productivity_score        INT CHECK (productivity_score BETWEEN 0 AND 20),
  originality_score         INT CHECK (originality_score BETWEEN 0 AND 20),
  efforts_score             INT CHECK (efforts_score BETWEEN 0 AND 10),
  horizontal_score          INT CHECK (horizontal_score BETWEEN 0 AND 10),
  hse_score                 INT CHECK (hse_score BETWEEN 0 AND 10),
  qualitative_score         INT CHECK (qualitative_score BETWEEN 0 AND 20),
  cost_score                INT CHECK (cost_score BETWEEN 0 AND 20),

  total_score               INT,
  grade                     VARCHAR(30),    -- Grade A/B/C/D
  qualitative_benefits      TEXT,
  cost_saving_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  reward_amount             NUMERIC(12,2) NOT NULL DEFAULT 0,

  decision                  approval_decision NOT NULL DEFAULT 'PENDING',
  decision_remarks          TEXT,
  evaluated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at               TIMESTAMPTZ
);

-- =========================
-- REWARD PROCESSING & NOTIFICATIONS
-- =========================
CREATE TABLE reward_payments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id                   UUID UNIQUE NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  payment_status            payment_status NOT NULL DEFAULT 'PENDING',
  payment_reference         VARCHAR(100),
  paid_amount               NUMERIC(12,2),
  processed_by_user_id      UUID REFERENCES users(id), -- unit HR / coordinator
  processed_at              TIMESTAMPTZ,
  remarks                   TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idea_id                   UUID REFERENCES ideas(id) ON DELETE CASCADE,
  title                     VARCHAR(200) NOT NULL,
  message                   TEXT NOT NULL,
  is_read                   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at                   TIMESTAMPTZ
);

-- =========================
-- PERFORMANCE INDEXES (important for 1000+ ideas)
-- =========================
CREATE INDEX idx_ideas_status ON ideas(current_status);
CREATE INDEX idx_ideas_originator ON ideas(originator_user_id);
CREATE INDEX idx_ideas_unit_status ON ideas(originator_unit_id, current_status);
CREATE INDEX idx_ideas_submitted_at ON ideas(submitted_at DESC);

CREATE INDEX idx_status_history_idea_time ON idea_status_history(idea_id, changed_at DESC);
CREATE INDEX idx_functional_reviews_pending ON idea_functional_reviews(review_type, decision);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
```

## Flow Coverage Mapping

- `ideas` + `idea_expected_benefits` + `idea_attachments`: employee submission stage.
- `idea_status_history` + `idea_comments`: coordinator/committee/HOD/BE audit-grade traceability.
- `idea_assignments`: selection committee chooses responsible department + implementer.
- `kaizen_reports` + `kaizen_why_analysis` + `kaizen_pqcdsem_impact`: full Kaizen template execution.
- `idea_functional_routing` + `idea_functional_reviews`: Unit Coordinator manual routing to HR/Finance/Quality with rejection backflow.
- `be_evaluations`: cost-benefit + reward recommendation + BE head approval + kaizen number trigger.
- `reward_payments`: unit HR/coordinator mark paid/pending and payment reference.
- `notifications`: alerts to originator, implementer, approvers.

## Important Business Rules to enforce in app/service layer

- Generate `idea_reference_no` at creation.
- Generate `kaizen_number` **only** when BE decision is approved.
- Lock employee editing after submission (`is_edit_locked = true`).
- Finance routing mandatory if `cost_saving_amount > 500000`.
- Why-Why entry max 10 words (validate in API/UI).
- On functional rejection or BE rejection, auto transition status back to Unit Coordinator stage and log history.

If you want, I can next give you:
1) seed data SQL for roles/status masters, and  
2) a `dbdiagram.io`/ER diagram version of this schema.

---

**User**

nice. here we need to chnage the users table with username employee_id and password for login page please make the ables based on that. also make all the tables have is_active, created_at, created_by, updated_at, updated_by mandatory

---

**Cursor**

Perfect — updated as requested.

Changes included:
- `users` table now uses `username`, `employee_id`, and `password_hash` (for login).
- **Every table** now has mandatory:
  - `is_active BOOLEAN NOT NULL DEFAULT TRUE`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `created_by UUID NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `updated_by UUID NOT NULL`

> Note: I used `password_hash` instead of plain `password` (security best practice).  
> If you still want a plain `password` column, I can change it.

---

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- =========================
-- ENUMS
-- =========================
CREATE TYPE idea_status AS ENUM (
  'IDEA_SUBMITTED',
  'IDEA_REJECTED_BY_COORDINATOR',
  'IDEA_APPROVED_BY_COORDINATOR',
  'ASSIGNED_FOR_IMPLEMENTATION',
  'IMPLEMENTATION_SUBMITTED',
  'VERIFIED_BY_COORDINATOR',
  'UNDER_FUNCTIONAL_REVIEW',
  'FUNCTIONAL_REJECTED',
  'FUNCTIONAL_APPROVED',
  'UNDER_BE_EVALUATION',
  'BE_REJECTED',
  'BE_APPROVED',
  'REWARD_PROCESSING',
  'REWARDED_CLOSED'
);

CREATE TYPE pqcdsem_type AS ENUM (
  'PRODUCTIVITY', 'QUALITY', 'COST', 'DELIVERY', 'SAFETY', 'ENVIRONMENT', 'MORALE'
);

CREATE TYPE functional_review_type AS ENUM ('HR', 'FINANCE', 'QUALITY');
CREATE TYPE approval_decision AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE payment_status AS ENUM ('PENDING', 'PAID');

-- =========================
-- MASTER TABLES
-- =========================
CREATE TABLE units (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                VARCHAR(30) UNIQUE NOT NULL,
  name                VARCHAR(120) UNIQUE NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID NOT NULL
);

CREATE TABLE departments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                VARCHAR(30) UNIQUE NOT NULL,
  name                VARCHAR(120) UNIQUE NOT NULL,
  is_functional_hod   BOOLEAN NOT NULL DEFAULT FALSE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID NOT NULL
);

CREATE TABLE areas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id             UUID NOT NULL REFERENCES units(id),
  code                VARCHAR(30) NOT NULL,
  name                VARCHAR(120) NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID NOT NULL,
  UNIQUE(unit_id, code),
  UNIQUE(unit_id, name)
);

CREATE TABLE roles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                VARCHAR(40) UNIQUE NOT NULL,
  name                VARCHAR(100) NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID NOT NULL
);

-- =========================
-- USERS / AUTH
-- =========================
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username            CITEXT UNIQUE NOT NULL,
  employee_id         VARCHAR(50) UNIQUE NOT NULL,
  password_hash       TEXT NOT NULL,          -- store bcrypt/argon2 hash
  full_name           VARCHAR(150) NOT NULL,
  email               CITEXT UNIQUE,
  mobile              VARCHAR(20),
  unit_id             UUID REFERENCES units(id),
  department_id       UUID REFERENCES departments(id),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID NOT NULL
);

CREATE TABLE user_roles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id             UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID NOT NULL,
  UNIQUE(user_id, role_id)
);

-- =========================
-- IDEA CORE
-- =========================
CREATE TABLE ideas (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_reference_no           VARCHAR(40) UNIQUE NOT NULL,
  kaizen_number               VARCHAR(40) UNIQUE,

  title                       VARCHAR(250) NOT NULL,
  short_description           TEXT NOT NULL,

  originator_user_id          UUID NOT NULL REFERENCES users(id),
  originator_unit_id          UUID NOT NULL REFERENCES units(id),
  originator_department_id    UUID NOT NULL REFERENCES departments(id),
  originator_area_id          UUID NOT NULL REFERENCES areas(id),

  current_status              idea_status NOT NULL DEFAULT 'IDEA_SUBMITTED',
  is_edit_locked              BOOLEAN NOT NULL DEFAULT FALSE,

  submitted_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_status_changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID NOT NULL,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                  UUID NOT NULL
);

CREATE TABLE idea_expected_benefits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id             UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  benefit             pqcdsem_type NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID NOT NULL,
  UNIQUE (idea_id, benefit)
);

CREATE TABLE files (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key         TEXT NOT NULL,
  original_file_name  TEXT NOT NULL,
  mime_type           VARCHAR(150),
  file_size_bytes     BIGINT,
  uploaded_by_user_id UUID REFERENCES users(id),
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID NOT NULL
);

CREATE TABLE idea_attachments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id             UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  file_id             UUID NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  attachment_type     VARCHAR(40) NOT NULL DEFAULT 'IDEA_SUBMISSION',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID NOT NULL
);

-- =========================
-- COMMENTS / AUDIT / ASSIGNMENT
-- =========================
CREATE TABLE idea_comments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id             UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  author_user_id      UUID NOT NULL REFERENCES users(id),
  author_role_code    VARCHAR(40) NOT NULL,
  comment_text        TEXT NOT NULL,
  is_system_generated BOOLEAN NOT NULL DEFAULT FALSE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID NOT NULL
);

CREATE TABLE idea_status_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id             UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  from_status         idea_status,
  to_status           idea_status NOT NULL,
  changed_by_user_id  UUID REFERENCES users(id),
  remarks             TEXT,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID NOT NULL
);

CREATE TABLE idea_assignments (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id                       UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  assigned_department_id        UUID NOT NULL REFERENCES departments(id),
  assigned_implementer_user_id  UUID NOT NULL REFERENCES users(id),
  assigned_by_user_id           UUID NOT NULL REFERENCES users(id),
  assigned_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active                     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                    UUID NOT NULL,
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                    UUID NOT NULL
);

CREATE TABLE idea_functional_routing (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id             UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  review_type         functional_review_type NOT NULL,
  routed_by_user_id   UUID NOT NULL REFERENCES users(id),
  routed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID NOT NULL,
  UNIQUE (idea_id, review_type)
);

CREATE TABLE idea_functional_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id             UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  review_type         functional_review_type NOT NULL,
  reviewer_user_id    UUID NOT NULL REFERENCES users(id),
  decision            approval_decision NOT NULL DEFAULT 'PENDING',
  remarks             TEXT,
  decided_at          TIMESTAMPTZ,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID NOT NULL,
  UNIQUE (idea_id, review_type)
);

-- =========================
-- KAIZEN IMPLEMENTATION
-- =========================
CREATE TABLE kaizen_reports (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id                     UUID UNIQUE NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  implementer_user_id         UUID NOT NULL REFERENCES users(id),

  category                    VARCHAR(20) NOT NULL CHECK (category IN ('CLINICAL', 'NON_CLINICAL')),
  kaizen_theme                VARCHAR(250) NOT NULL,
  implementation_date         DATE,

  problem_what                TEXT,
  problem_where               TEXT,
  problem_when                TEXT,
  problem_how                 TEXT,
  problem_how_much            TEXT,

  root_cause                  TEXT,
  idea_to_eliminate           TEXT,
  countermeasures_text        TEXT,

  before_description          TEXT,
  after_description           TEXT,

  standardization_opl         BOOLEAN NOT NULL DEFAULT FALSE,
  standardization_sop         BOOLEAN NOT NULL DEFAULT FALSE,
  standardization_manual      BOOLEAN NOT NULL DEFAULT FALSE,
  standardization_others      BOOLEAN NOT NULL DEFAULT FALSE,
  standardization_others_text TEXT,

  horizontal_deployment       BOOLEAN NOT NULL DEFAULT FALSE,
  horizontal_deployment_desc  TEXT,

  submitted_at                TIMESTAMPTZ,

  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID NOT NULL,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                  UUID NOT NULL
);

CREATE TABLE kaizen_why_analysis (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kaizen_report_id    UUID NOT NULL REFERENCES kaizen_reports(id) ON DELETE CASCADE,
  why_sequence        SMALLINT NOT NULL CHECK (why_sequence BETWEEN 1 AND 10),
  why_text            VARCHAR(200) NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID NOT NULL,
  UNIQUE (kaizen_report_id, why_sequence)
);

CREATE TABLE kaizen_pqcdsem_impact (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kaizen_report_id    UUID NOT NULL REFERENCES kaizen_reports(id) ON DELETE CASCADE,
  impact              pqcdsem_type NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID NOT NULL,
  UNIQUE (kaizen_report_id, impact)
);

-- =========================
-- BE EVALUATION
-- =========================
CREATE TABLE be_evaluations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id                   UUID UNIQUE NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  evaluated_by_user_id      UUID NOT NULL REFERENCES users(id),
  approved_by_be_head_id    UUID REFERENCES users(id),

  productivity_score        INT CHECK (productivity_score BETWEEN 0 AND 20),
  originality_score         INT CHECK (originality_score BETWEEN 0 AND 20),
  efforts_score             INT CHECK (efforts_score BETWEEN 0 AND 10),
  horizontal_score          INT CHECK (horizontal_score BETWEEN 0 AND 10),
  hse_score                 INT CHECK (hse_score BETWEEN 0 AND 10),
  qualitative_score         INT CHECK (qualitative_score BETWEEN 0 AND 20),
  cost_score                INT CHECK (cost_score BETWEEN 0 AND 20),

  total_score               INT,
  grade                     VARCHAR(30),
  qualitative_benefits      TEXT,
  cost_saving_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  reward_amount             NUMERIC(12,2) NOT NULL DEFAULT 0,

  decision                  approval_decision NOT NULL DEFAULT 'PENDING',
  decision_remarks          TEXT,
  evaluated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at               TIMESTAMPTZ,

  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                UUID NOT NULL,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                UUID NOT NULL
);

-- =========================
-- REWARD / NOTIFICATIONS
-- =========================
CREATE TABLE reward_payments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id                   UUID UNIQUE NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  payment_status            payment_status NOT NULL DEFAULT 'PENDING',
  payment_reference         VARCHAR(100),
  paid_amount               NUMERIC(12,2),
  processed_by_user_id      UUID REFERENCES users(id),
  processed_at              TIMESTAMPTZ,
  remarks                   TEXT,
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                UUID NOT NULL,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                UUID NOT NULL
);

CREATE TABLE notifications (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idea_id                   UUID REFERENCES ideas(id) ON DELETE CASCADE,
  title                     VARCHAR(200) NOT NULL,
  message                   TEXT NOT NULL,
  is_read                   BOOLEAN NOT NULL DEFAULT FALSE,
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                UUID NOT NULL,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                UUID NOT NULL
);

-- =========================
-- INDEXES
-- =========================
CREATE INDEX idx_ideas_status ON ideas(current_status);
CREATE INDEX idx_ideas_originator ON ideas(originator_user_id);
CREATE INDEX idx_ideas_unit_status ON ideas(originator_unit_id, current_status);
CREATE INDEX idx_ideas_submitted_at ON ideas(submitted_at DESC);

CREATE INDEX idx_status_history_idea_time ON idea_status_history(idea_id, changed_at DESC);
CREATE INDEX idx_functional_reviews_pending ON idea_functional_reviews(review_type, decision);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
```

If you want, next I can give an **ALTER script** (for existing DB) instead of full create script, so you can migrate current tables safely.

---

**User**

give me the promt whats you understand in this project

---

**Cursor**

Here’s the project prompt as I understand it (you can reuse this directly for dev/AI context):

```text
Build a scalable, role-based Kaizen & Continuous Improvement management platform for a hospital enterprise.

Core workflow:
1) Employee submits only basic idea details (low-friction):
   - Idea title/short description
   - Unit, Department, Area/Location (OP/IP/ER/ICU/OT etc.)
   - Expected benefits (PQCDSEM)
   - Optional attachment
   System generates Idea Reference ID and locks editing after submit.

2) Unit Coordinator validates idea:
   - Approve or Reject (remarks mandatory on rejection)
   - If rejected: notify employee with remarks
   - If approved: route to Selection Committee

3) Selection Committee assigns ownership:
   - Choose responsible department
   - Choose implementer (employee)
   - Notify implementer and idea originator
   - Keep UI minimal (actions/status focused)

4) Implementer completes full Kaizen template:
   - Auto-fill theme + idea reference
   - Fill problem statement, why-why, root cause, countermeasures, standardization, before/after, horizontal deployment, etc.
   - Support file/image uploads
   - Enforce mandatory fields and limits (why-why max 10 words)
   - Submit implementation report reliably

5) Unit Coordinator post-implementation verification:
   - Verify implementation
   - Manually route to one/more functional HODs: Quality/HR/Finance
   - Finance routing mandatory if savings > INR 5 lakhs

6) Functional HOD reviews (HR/Finance/Quality):
   - Approve or Reject with remarks
   - On rejection, send back to Unit Coordinator
   - Maintain full rejection history and audit trail

7) Business Excellence evaluation:
   - Validate impact and cost-benefit
   - Define cost savings, qualitative benefits, reward amount
   - BE Head final approval
   - Generate official Kaizen Number only after BE approval

8) Reward processing & closure:
   - Route to Unit HR + Unit Coordinator
   - Mark payment status (Paid/Pending), payment reference
   - Notify idea originator and implementer

9) Dynamic role-based dashboards and workflow board:
   - Employee: own ideas, status, remarks, rewards
   - Unit Coordinator: unit-wide pipeline and approvals
   - Selection Committee: enterprise idea pool and assignment
   - Implementer: assigned kaizens
   - HODs: pending functional approvals
   - BE: impact/reward governance
   - Admin: master data/configuration

Technical expectations:
- PostgreSQL backend with normalized schema
- High traceability (status history, comments, audit fields)
- Role-based access control and secure workflows
- Scalable for 1000+ ideas
- Notification support
- Optional AI suggestion panel in Kaizen detail (Gemini suggestImprovements using idea title)
- UI readability improvements with provided color palette and high-contrast form controls
```

If you want, I can also give this in:
- **client-friendly BRD format**, or
- **developer-ready module-wise task breakdown** (Frontend, Backend APIs, DB, RBAC, Notifications).

---

**User**

why its not running in the browser

---

**Cursor**

I’ll quickly diagnose the run issue by checking existing terminal output, then verify install/start scripts and run the app to capture the actual error causing the browser failure.

I found a likely root cause from your terminal logs: the project is being run from a **UNC network path** (`\\192.168...`) and Node/Vite warns that `CMD.EXE` does not support UNC paths. I’ll quickly validate build/runtime from this path and then give you the exact fix.

It’s failing because the project is running from a **UNC network path** (`\\192.168...`), and `npm/vite` uses `cmd.exe` under the hood, which does not support UNC working directories.

Your logs already show this exact issue:

- `CMD.EXE was started with the above path as the current directory.`
- `UNC paths are not supported. Defaulting to Windows directory.`
- Then build fails with `Could not resolve entry module "index.html"`.

## Fix

Run the app from a **mapped drive letter** (or local disk), not directly from `\\...`.

### Option 1 (quick, recommended)
Open `cmd` and run:
```bat
pushd "\\192.168.148.33\UserOU$\140203\Documents\kaizenNew\kaizenNew\kaizen-application-new"
npm install
npm run dev
```
`pushd` auto-maps the UNC path to a temp drive (like `Z:`), which fixes this.

### Option 2 (persistent mapping)
Map a drive and use that path every time:
```bat
net use K: "\\192.168.148.33\UserOU$"
cd /d K:\140203\Documents\kaizenNew\kaizenNew\kaizen-application-new
npm run dev
```

Then open: [http://localhost:5173](http://localhost:5173)

If you want, I can also give you a small PowerShell script so one command always starts this project correctly from mapped drive.

