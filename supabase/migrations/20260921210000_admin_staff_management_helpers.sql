-- Staff & Roles (Option A): grant metadata on admins.
-- DRAFT — do not apply until explicitly approved.
-- Additive only. Keeps single-role admins model (no junction or separate audit tables).
-- No RLS policy changes.

ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS granted_at timestamptz;

COMMENT ON COLUMN public.admins.granted_by IS 'Auth user who last granted or changed this admin assignment.';
COMMENT ON COLUMN public.admins.granted_at IS 'When admin access was last granted or role was last changed.';

-- Speeds last-active-superadmin checks in Edge (count with filter).
CREATE INDEX IF NOT EXISTS idx_admins_active_superadmin
  ON public.admins (id)
  WHERE is_superadmin = true AND is_active = true;

-- Backfill grant timestamp from row creation; granted_by stays NULL for legacy rows.
UPDATE public.admins
SET granted_at = COALESCE(granted_at, created_at)
WHERE granted_at IS NULL;

-- Reversible:
--   ALTER TABLE public.admins DROP COLUMN IF EXISTS granted_by;
--   ALTER TABLE public.admins DROP COLUMN IF EXISTS granted_at;
--   DROP INDEX IF EXISTS public.idx_admins_active_superadmin;
