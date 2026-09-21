-- Partial unique index on members.id_number (non-empty values only).
-- Safe / reversible: DROP INDEX IF EXISTS members_id_number_unique;
-- Does not alter or backfill existing rows. NULL / blank IDs remain allowed
-- for legacy incomplete profiles (shown as "Incomplete profile" in admin UI).
--
-- BEFORE APPLYING: ensure no duplicate non-null id_number values exist:
--   SELECT id_number, COUNT(*) FROM members
--   WHERE id_number IS NOT NULL AND btrim(id_number) <> ''
--   GROUP BY id_number HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS members_id_number_unique
  ON public.members (id_number)
  WHERE id_number IS NOT NULL AND btrim(id_number) <> '';

COMMENT ON INDEX members_id_number_unique IS
  'Ensures Kenyan National ID uniqueness when present; nulls allowed for incomplete profiles.';
