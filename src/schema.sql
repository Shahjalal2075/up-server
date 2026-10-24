CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) NOT NULL,
  full_name     VARCHAR(100),
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL
                CHECK (role IN ('super_admin','admin','moderator','accounting','printer')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

-- Soft delete: user delete hole row thake (deleted_at set hoy), tai onno data-r reference nosto hoy na.
-- Purono database-eo ei 3 line safe (npm run db:init abar chalaleo hobe).
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_active_uq ON users (username) WHERE deleted_at IS NULL;

-- Dashboard stats ei table theke ashe. Holding page-er guideline pawar por column gulo update kora hobe.
CREATE TABLE IF NOT EXISTS holdings (
  id           SERIAL PRIMARY KEY,
  holding_no   VARCHAR(30) UNIQUE NOT NULL,
  owner_name   VARCHAR(150) NOT NULL,
  village      VARCHAR(100),
  annual_tax   NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value)
VALUES ('union_name', '৫নং বাহিরদিয়া মানসা ইউনিয়ন পরিষদ')
ON CONFLICT (key) DO NOTHING;

-- গ্রাম ভিত্তিক তথ্য
CREATE TABLE IF NOT EXISTS villages (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  ward_no       SMALLINT NOT NULL CHECK (ward_no >= 1),
  population    INTEGER NOT NULL CHECK (population >= 0),
  voters        INTEGER NOT NULL CHECK (voters >= 0),
  literacy_rate NUMERIC(5,2) NOT NULL CHECK (literacy_rate BETWEEN 0 AND 100),
  head_name     VARCHAR(100) NOT NULL,
  head_mobile   VARCHAR(15) NOT NULL,
  notes         TEXT,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS villages_name_ward_uq ON villages (LOWER(name), ward_no);

-- মসজিদ তথ্য
CREATE TABLE IF NOT EXISTS mosques (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  ward_no        SMALLINT NOT NULL CHECK (ward_no >= 1),
  village_name   VARCHAR(100) NOT NULL,
  imam_name      VARCHAR(100) NOT NULL,
  imam_mobile    VARCHAR(15) NOT NULL,
  muazzin_name   VARCHAR(100) NOT NULL,
  muazzin_mobile VARCHAR(15) NOT NULL,
  annual_cost    NUMERIC(12,2) CHECK (annual_cost >= 0),
  notes          TEXT,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS mosques_name_ward_village_uq ON mosques (LOWER(name), ward_no, LOWER(village_name));
