-- Add arcium_poll_id column to questions_repo
-- When set, this question's answers are (or will be) stored on the Arcium network for verifiable aggregation.
-- At most one question per day is tagged as Arcium-enabled.

ALTER TABLE questions_repo
ADD COLUMN IF NOT EXISTS arcium_poll_id INTEGER;

COMMENT ON COLUMN questions_repo.arcium_poll_id IS 'When set, this question is Arcium-enabled for private verifiable aggregation. At most one per day.';
