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

-- কৃষি প্রত্যয়নপত্র (সনদ আবেদন). Delete = soft delete (deleted_at)
CREATE TABLE IF NOT EXISTS agri_certificates (
  id                SERIAL PRIMARY KEY,
  cert_no           VARCHAR(20) UNIQUE NOT NULL,
  applicant_name    VARCHAR(150) NOT NULL,
  father_name       VARCHAR(150) NOT NULL,
  mother_name       VARCHAR(150) NOT NULL,
  spouse_name       VARCHAR(150),
  birth_date        DATE NOT NULL,
  marital_status    VARCHAR(30) NOT NULL,
  mobile            VARCHAR(15) NOT NULL,
  nid               VARCHAR(20),
  brn               VARCHAR(25),
  post_office       VARCHAR(100),
  current_address   JSONB NOT NULL,
  permanent_address JSONB NOT NULL,
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS agri_cert_nid_idx ON agri_certificates (nid);
CREATE INDEX IF NOT EXISTS agri_cert_mobile_idx ON agri_certificates (mobile);
CREATE INDEX IF NOT EXISTS agri_cert_created_idx ON agri_certificates (created_at DESC);

-- ওয়ারিশ সনদ. Delete = soft delete
CREATE TABLE IF NOT EXISTS warish_certificates (
  id                 SERIAL PRIMARY KEY,
  cert_no            VARCHAR(20) UNIQUE NOT NULL,
  deceased_name      VARCHAR(150) NOT NULL,
  father_name        VARCHAR(150) NOT NULL,
  mother_name        VARCHAR(150) NOT NULL,
  deceased_nid       VARCHAR(25),
  death_date         DATE,
  death_reg_no       VARCHAR(40),
  village            VARCHAR(100),
  post_office        VARCHAR(100),
  ward_no            SMALLINT NOT NULL,
  upazila            VARCHAR(100) NOT NULL,
  district           VARCHAR(100) NOT NULL,
  applicant_name     VARCHAR(150) NOT NULL,
  applicant_relation VARCHAR(50),
  heirs              JSONB NOT NULL,
  created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS warish_cert_nid_idx ON warish_certificates (deceased_nid);
CREATE INDEX IF NOT EXISTS warish_cert_created_idx ON warish_certificates (created_at DESC);

-- নাগরিক সনদ (agri_certificates-এর মতো একই ফিল্ড). Delete = soft delete
CREATE TABLE IF NOT EXISTS citizen_certificates (
  id                SERIAL PRIMARY KEY,
  cert_no           VARCHAR(20) UNIQUE NOT NULL,
  applicant_name    VARCHAR(150) NOT NULL,
  father_name       VARCHAR(150) NOT NULL,
  mother_name       VARCHAR(150) NOT NULL,
  spouse_name       VARCHAR(150),
  birth_date        DATE NOT NULL,
  marital_status    VARCHAR(30) NOT NULL,
  mobile            VARCHAR(15) NOT NULL,
  nid               VARCHAR(20),
  brn               VARCHAR(25),
  post_office       VARCHAR(100),
  current_address   JSONB NOT NULL,
  permanent_address JSONB NOT NULL,
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS citizen_cert_nid_idx ON citizen_certificates (nid);
CREATE INDEX IF NOT EXISTS citizen_cert_mobile_idx ON citizen_certificates (mobile);
CREATE INDEX IF NOT EXISTS citizen_cert_created_idx ON citizen_certificates (created_at DESC);

-- ট্রেড লাইসেন্স. cert_no = লাইসেন্স নম্বর. photo = ছোট করা JPEG data URL (নিজের database-এই থাকে). Delete = soft delete
CREATE TABLE IF NOT EXISTS trade_licenses (
  id               SERIAL PRIMARY KEY,
  cert_no          VARCHAR(20) UNIQUE NOT NULL,
  business_name    VARCHAR(150) NOT NULL,
  owner_name       VARCHAR(150) NOT NULL,
  father_name      VARCHAR(150) NOT NULL,
  mother_name      VARCHAR(150) NOT NULL,
  mobile           VARCHAR(15) NOT NULL,
  nid              VARCHAR(20),
  brn              VARCHAR(30),
  tax_id           VARCHAR(30),
  business_address VARCHAR(250) NOT NULL,
  business_type    VARCHAR(100) NOT NULL,
  capital          VARCHAR(50),
  issue_date       DATE,
  renewal_date     DATE,
  expiry_date      DATE,
  fiscal_year      VARCHAR(20),
  license_fee      NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat              NUMERIC(12,2) NOT NULL DEFAULT 0,
  profession_tax   NUMERIC(12,2) NOT NULL DEFAULT 0,
  ad_tax           NUMERIC(12,2) NOT NULL DEFAULT 0,
  arrears          NUMERIC(12,2) NOT NULL DEFAULT 0,
  service_charge   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_fee        NUMERIC(12,2) NOT NULL DEFAULT 0,
  photo            TEXT,
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS trade_lic_mobile_idx ON trade_licenses (mobile);
CREATE INDEX IF NOT EXISTS trade_lic_created_idx ON trade_licenses (created_at DESC);

-- ---- সবার জন্য আবেদন: অনুমান-অযোগ্য public_key + একই NID/BRN/মোবাইলে ডুপ্লিকেট আটকানো ----
-- (পুরনো ডুপ্লিকেট ডাটা থাকলে unique index বাদ যায়, কিন্তু অ্যাপের ভেতরের চেক তবু কাজ করে)
ALTER TABLE agri_certificates ADD COLUMN IF NOT EXISTS public_key VARCHAR(40) NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');
CREATE UNIQUE INDEX IF NOT EXISTS agri_cert_public_key_uq ON agri_certificates (public_key);
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS agri_cert_nid_uq ON agri_certificates (nid) WHERE deleted_at IS NULL AND nid IS NOT NULL;
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'duplicate agri_certificates.nid ache, unique index bad';
END $$;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS agri_cert_brn_uq ON agri_certificates (brn) WHERE deleted_at IS NULL AND brn IS NOT NULL;
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'duplicate agri_certificates.brn ache, unique index bad';
END $$;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS agri_cert_mobile_uq ON agri_certificates (mobile) WHERE deleted_at IS NULL AND mobile IS NOT NULL;
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'duplicate agri_certificates.mobile ache, unique index bad';
END $$;
ALTER TABLE citizen_certificates ADD COLUMN IF NOT EXISTS public_key VARCHAR(40) NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');
CREATE UNIQUE INDEX IF NOT EXISTS citizen_cert_public_key_uq ON citizen_certificates (public_key);
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS citizen_cert_nid_uq ON citizen_certificates (nid) WHERE deleted_at IS NULL AND nid IS NOT NULL;
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'duplicate citizen_certificates.nid ache, unique index bad';
END $$;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS citizen_cert_brn_uq ON citizen_certificates (brn) WHERE deleted_at IS NULL AND brn IS NOT NULL;
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'duplicate citizen_certificates.brn ache, unique index bad';
END $$;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS citizen_cert_mobile_uq ON citizen_certificates (mobile) WHERE deleted_at IS NULL AND mobile IS NOT NULL;
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'duplicate citizen_certificates.mobile ache, unique index bad';
END $$;
ALTER TABLE warish_certificates ADD COLUMN IF NOT EXISTS public_key VARCHAR(40) NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');
CREATE UNIQUE INDEX IF NOT EXISTS warish_cert_public_key_uq ON warish_certificates (public_key);
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS warish_cert_deceased_nid_uq ON warish_certificates (deceased_nid) WHERE deleted_at IS NULL AND deceased_nid IS NOT NULL;
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'duplicate warish_certificates.deceased_nid ache, unique index bad';
END $$;
ALTER TABLE trade_licenses ADD COLUMN IF NOT EXISTS public_key VARCHAR(40) NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');
CREATE UNIQUE INDEX IF NOT EXISTS trade_lic_public_key_uq ON trade_licenses (public_key);
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS trade_lic_nid_uq ON trade_licenses (nid) WHERE deleted_at IS NULL AND nid IS NOT NULL;
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'duplicate trade_licenses.nid ache, unique index bad';
END $$;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS trade_lic_brn_uq ON trade_licenses (brn) WHERE deleted_at IS NULL AND brn IS NOT NULL;
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'duplicate trade_licenses.brn ache, unique index bad';
END $$;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS trade_lic_mobile_uq ON trade_licenses (mobile) WHERE deleted_at IS NULL AND mobile IS NOT NULL;
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'duplicate trade_licenses.mobile ache, unique index bad';
END $$;

-- ---- ডিজিটাল হোল্ডিং (আগের holdings table বাড়ানো হলো; dashboard এর হিসাব আগের মতোই চলে) ----
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS father_name        VARCHAR(150);
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS mother_name        VARCHAR(150);
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS nid                VARCHAR(25);
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS mobile             VARCHAR(15);
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS ward_no            SMALLINT;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS family_members     INTEGER;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS permanent_address  VARCHAR(250);
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS up_benefit         VARCHAR(120);
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS land_area          VARCHAR(50);
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS house_type         VARCHAR(60);
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS occupation         VARCHAR(100);
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS annual_income      NUMERIC(14,2);
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS surveyor_name      VARCHAR(150);
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS note               TEXT;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS deleted_at         TIMESTAMPTZ;
-- soft delete-er jonno: unique holding no shudhu active row-er moddhe
ALTER TABLE holdings DROP CONSTRAINT IF EXISTS holdings_holding_no_key;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS holdings_no_active_uq ON holdings (LOWER(holding_no)) WHERE deleted_at IS NULL;
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'holdings-e duplicate holding_no ache, unique index bad';
END $$;
CREATE INDEX IF NOT EXISTS holdings_ward_village_idx ON holdings (ward_no, village);

-- হোল্ডিংয়ের সনদ/প্লেট কে কতবার প্রিন্ট বা ডাউনলোড করেছে
CREATE TABLE IF NOT EXISTS holding_events (
  id         SERIAL PRIMARY KEY,
  holding_id INTEGER NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  doc        VARCHAR(12) NOT NULL CHECK (doc IN ('certificate', 'plate')),
  action     VARCHAR(12) NOT NULL CHECK (action IN ('print', 'download')),
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS holding_events_holding_idx ON holding_events (holding_id);
CREATE INDEX IF NOT EXISTS holding_events_user_idx ON holding_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS holdings_creator_idx ON holdings (created_by, created_at);
