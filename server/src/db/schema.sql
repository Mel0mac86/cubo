-- =====================================================================
--  MY MONEY ADVENTURE — schema PostgreSQL
--  Tutti gli importi sono BIGINT in CENTESIMI. Mai float per il denaro.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- FAMIGLIA
CREATE TABLE IF NOT EXISTS families (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  password_hash  TEXT NOT NULL,               -- password dell'account familiare
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Entita' di autenticazione. Un genitore accede con email+password di famiglia;
-- un bambino e' un profilo dentro la sessione familiare (nessuna password).
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('PARENT', 'CHILD')),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_family ON users(family_id);

CREATE TABLE IF NOT EXISTS parents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  family_id   UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  pin_hash    TEXT NOT NULL,                  -- PIN che protegge la modalita' genitore
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS children (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  family_id             UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  age                   INTEGER CHECK (age IS NULL OR (age BETWEEN 3 AND 21)),
  avatar                TEXT NOT NULL DEFAULT '🦊',
  avatar_color          TEXT NOT NULL DEFAULT '#7C5CFF',
  xp                    INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  onboarding_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_children_family ON children(family_id);

-- ------------------------------------------------------------ IMPOSTAZIONI
CREATE TABLE IF NOT EXISTS settings (
  child_id                 UUID PRIMARY KEY REFERENCES children(id) ON DELETE CASCADE,
  min_give_percent         INTEGER NOT NULL DEFAULT 10 CHECK (min_give_percent BETWEEN 0 AND 100),
  default_save_percent     INTEGER NOT NULL DEFAULT 60 CHECK (default_save_percent BETWEEN 0 AND 100),
  default_spend_percent    INTEGER NOT NULL DEFAULT 30 CHECK (default_spend_percent BETWEEN 0 AND 100),
  default_give_percent     INTEGER NOT NULL DEFAULT 10 CHECK (default_give_percent BETWEEN 0 AND 100),
  interest_cents_per_euro  INTEGER NOT NULL DEFAULT 5 CHECK (interest_cents_per_euro BETWEEN 0 AND 100),
  interest_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  allowance_cents          BIGINT  NOT NULL DEFAULT 0 CHECK (allowance_cents >= 0),
  allowance_day            INTEGER NOT NULL DEFAULT 6 CHECK (allowance_day BETWEEN 0 AND 6),
  locked_features          TEXT[]  NOT NULL DEFAULT '{}',
  sound_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT split_predefinito_somma_100
    CHECK (default_save_percent + default_spend_percent + default_give_percent = 100),
  CONSTRAINT give_predefinito_non_sotto_minimo
    CHECK (default_give_percent >= min_give_percent)
);

-- --------------------------------------------------------------- SALVADANAI
CREATE TABLE IF NOT EXISTS jars (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id      UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('SAVE', 'SPEND', 'GIVE')),
  balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (child_id, type)
);

-- ---------------------------------------------------------------- OBIETTIVI
CREATE TABLE IF NOT EXISTS goals (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id                 UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  emoji                    TEXT NOT NULL DEFAULT '⭐',
  image_url                TEXT,
  target_cents             BIGINT NOT NULL CHECK (target_cents > 0),
  saved_at_creation_cents  BIGINT NOT NULL DEFAULT 0 CHECK (saved_at_creation_cents >= 0),
  target_date              DATE,
  status                   TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','ARCHIVED')),
  is_primary               BOOLEAN NOT NULL DEFAULT FALSE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_goals_child ON goals(child_id, status);
-- un solo obiettivo principale per bambino
CREATE UNIQUE INDEX IF NOT EXISTS uq_goal_primario
  ON goals(child_id) WHERE is_primary AND status = 'ACTIVE';

-- -------------------------------------------------------------- TRANSAZIONI
CREATE TABLE IF NOT EXISTS transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id              UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  type                  TEXT NOT NULL CHECK (type IN
                          ('ALLOWANCE','JOB','GIFT','PURCHASE','DONATION','INTEREST',
                           'TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT')),
  jar                   TEXT NOT NULL CHECK (jar IN ('SAVE','SPEND','GIVE')),
  amount_cents          BIGINT NOT NULL CHECK (amount_cents <> 0),
  balance_before_cents  BIGINT NOT NULL CHECK (balance_before_cents >= 0),
  balance_after_cents   BIGINT NOT NULL CHECK (balance_after_cents >= 0),
  description           TEXT NOT NULL,
  source                TEXT NOT NULL DEFAULT 'app',
  created_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  goal_id               UUID REFERENCES goals(id) ON DELETE SET NULL,
  group_id              UUID,
  client_id             TEXT,       -- id generato offline dal client: garantisce idempotenza
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT saldo_coerente CHECK (balance_after_cents = balance_before_cents + amount_cents)
);
CREATE INDEX IF NOT EXISTS idx_tx_child_date ON transactions(child_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_group ON transactions(group_id);
CREATE INDEX IF NOT EXISTS idx_tx_goal ON transactions(goal_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_client_id ON transactions(child_id, client_id) WHERE client_id IS NOT NULL;

-- Entrate inserite dal genitore e in attesa che il bambino scelga la divisione.
CREATE TABLE IF NOT EXISTS pending_incomes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id            UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  amount_cents        BIGINT NOT NULL CHECK (amount_cents > 0),
  type                TEXT NOT NULL DEFAULT 'ALLOWANCE' CHECK (type IN ('ALLOWANCE','GIFT','JOB','ADJUSTMENT')),
  description         TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ALLOCATED','CANCELLED')),
  created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  allocated_group_id  UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  allocated_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pending_child ON pending_incomes(child_id, status);

-- Scelte di ripartizione fatte dal bambino (storico degli slider).
CREATE TABLE IF NOT EXISTS allocation_choices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id       UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  group_id       UUID NOT NULL,
  amount_cents   BIGINT NOT NULL CHECK (amount_cents > 0),
  save_percent   INTEGER NOT NULL,
  spend_percent  INTEGER NOT NULL,
  give_percent   INTEGER NOT NULL,
  source         TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ripartizione_somma_100 CHECK (save_percent + spend_percent + give_percent = 100)
);
CREATE INDEX IF NOT EXISTS idx_alloc_child ON allocation_choices(child_id, created_at DESC);

-- ------------------------------------------------------------------ LAVORI
CREATE TABLE IF NOT EXISTS jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  emoji         TEXT NOT NULL DEFAULT '💪',
  reward_cents  BIGINT NOT NULL CHECK (reward_cents > 0),
  description   TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_family ON jobs(family_id, active);

CREATE TABLE IF NOT EXISTS job_requests (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                   UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  child_id                 UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  status                   TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  requested_reward_cents   BIGINT NOT NULL CHECK (requested_reward_cents > 0),
  approved_reward_cents    BIGINT CHECK (approved_reward_cents IS NULL OR approved_reward_cents > 0),
  note                     TEXT,
  parent_note              TEXT,
  requested_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at               TIMESTAMPTZ,
  decided_by_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  transaction_group_id     UUID
);
CREATE INDEX IF NOT EXISTS idx_jobreq_child ON job_requests(child_id, status);
-- una sola richiesta in attesa per lo stesso lavoro
CREATE UNIQUE INDEX IF NOT EXISTS uq_jobreq_pending
  ON job_requests(job_id, child_id) WHERE status = 'PENDING';

-- --------------------------------------------------------------- DONAZIONI
CREATE TABLE IF NOT EXISTS donation_goals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id       UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  cause          TEXT NOT NULL CHECK (cause IN ('ANIMALI','AMBIENTE','PERSONE','ISTRUZIONE','EMERGENZE')),
  target_cents   BIGINT NOT NULL CHECK (target_cents > 0),
  donated_cents  BIGINT NOT NULL DEFAULT 0 CHECK (donated_cents >= 0),
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED')),
  note           TEXT,
  photo_url      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_donation_child ON donation_goals(child_id, status);

-- Donazioni effettivamente consegnate (richiedono conferma del genitore).
CREATE TABLE IF NOT EXISTS donations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id          UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  donation_goal_id  UUID REFERENCES donation_goals(id) ON DELETE SET NULL,
  amount_cents      BIGINT NOT NULL CHECK (amount_cents > 0),
  cause             TEXT NOT NULL,
  note              TEXT,
  photo_url         TEXT,
  confirmed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  transaction_id    UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- INTERESSE
CREATE TABLE IF NOT EXISTS interest_accruals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  period_key      TEXT NOT NULL,                -- 'YYYY-MM'
  base_cents      BIGINT NOT NULL,
  cents_per_euro  INTEGER NOT NULL,
  interest_cents  BIGINT NOT NULL,
  transaction_id  UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (child_id, period_key)                 -- mai due accrediti nello stesso mese
);

-- ------------------------------------------------------- XP / LIVELLI / BADGE
CREATE TABLE IF NOT EXISTS levels (
  level        INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  emoji        TEXT NOT NULL,
  min_xp       INTEGER NOT NULL,
  description  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS xp_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xp_child ON xp_events(child_id, created_at DESC);

CREATE TABLE IF NOT EXISTS achievements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id     UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,
  title        TEXT NOT NULL,
  emoji        TEXT NOT NULL,
  unlocked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (child_id, code)
);

-- ------------------------------------------------------------ EDUCAZIONE
CREATE TABLE IF NOT EXISTS lessons (
  id            TEXT PRIMARY KEY,
  position      INTEGER NOT NULL,
  title         TEXT NOT NULL,
  emoji         TEXT NOT NULL,
  summary       TEXT NOT NULL,
  minutes       INTEGER NOT NULL DEFAULT 3,
  content       JSONB NOT NULL,     -- pagine della mini-lezione
  quiz          JSONB NOT NULL      -- domande + risposte
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id      UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  lesson_id     TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at  TIMESTAMPTZ,
  best_score    INTEGER NOT NULL DEFAULT 0,
  attempts      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (child_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  lesson_id   TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  score       INTEGER NOT NULL,
  total       INTEGER NOT NULL,
  answers     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------- NOTIFICHE
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  emoji       TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notif_child ON notifications(child_id, created_at DESC);

-- ------------------------------------------------------ CONVERSAZIONI COACH
CREATE TABLE IF NOT EXISTS coach_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('child','coach')),
  content     TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coach_child ON coach_messages(child_id, created_at);
