-- Invite codes table: one row per code, short string, used flag (0 = available, 1 = used).
-- Uniqueness enforced on code for fast lookups and to prevent duplicates.

CREATE TABLE IF NOT EXISTS invite_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL,
  used       smallint NOT NULL DEFAULT 0 CHECK (used IN (0, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code)
);

-- Index for lookup by code (validation during registration)
CREATE UNIQUE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes (code);

-- Index for listing available codes (used = 0)
CREATE INDEX IF NOT EXISTS idx_invite_codes_used ON invite_codes (used);

COMMENT ON TABLE invite_codes IS 'Invite codes for registration; used=0 available, used=1 consumed.';
COMMENT ON COLUMN invite_codes.code IS 'Short unique invite code string.';
COMMENT ON COLUMN invite_codes.used IS '0 = available, 1 = used.';
