-- One active family/beneficiary row per (member_id, id_number).
-- Partial: inactive rows and null/blank IDs are allowed (re-add after soft-delete).
-- Stops if live duplicates exist — do not merge or delete automatically.
-- Reversible: DROP INDEX IF EXISTS public.family_members_member_id_number_active_unique;

DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT member_id, id_number
    FROM public.family_members
    WHERE is_active = true
      AND id_number IS NOT NULL
      AND btrim(id_number) <> ''
    GROUP BY member_id, id_number
    HAVING COUNT(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'family_members has % duplicate active (member_id, id_number) groups; do not merge automatically',
      dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS family_members_member_id_number_active_unique
  ON public.family_members (member_id, id_number)
  WHERE is_active = true
    AND id_number IS NOT NULL
    AND btrim(id_number) <> '';

COMMENT ON INDEX public.family_members_member_id_number_active_unique IS
  'Active family/beneficiary IDs unique per principal member. Inactive and blank IDs excluded.';
