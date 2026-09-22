-- ============================================================================
-- Package nesting + age-aware contribution tiers
-- Extends existing packages / package_tiers (no duplicate pricing table).
-- Does not enable M-Pesa. Idempotent where practical.
-- ============================================================================

-- Parent package for nested sub-categories (e.g. Mission of Mercy → Widows)
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS parent_package_id uuid REFERENCES public.packages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS packages_parent_package_id_idx
  ON public.packages (parent_package_id)
  WHERE parent_package_id IS NOT NULL;

-- Prevent a package from being its own parent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'packages_parent_not_self'
  ) THEN
    ALTER TABLE public.packages
      ADD CONSTRAINT packages_parent_not_self
      CHECK (parent_package_id IS NULL OR parent_package_id <> id);
  END IF;
END $$;

-- Age bounds on contribution tiers (null = unbounded / flat or family option)
ALTER TABLE public.package_tiers
  ADD COLUMN IF NOT EXISTS min_age int,
  ADD COLUMN IF NOT EXISTS max_age int;

-- Generic updated_at triggers on this table require the column to exist.
ALTER TABLE public.package_tiers
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'package_tiers_age_bounds_check'
  ) THEN
    ALTER TABLE public.package_tiers
      ADD CONSTRAINT package_tiers_age_bounds_check
      CHECK (
        (min_age IS NULL OR min_age >= 0)
        AND (max_age IS NULL OR max_age >= 0)
        AND (min_age IS NULL OR max_age IS NULL OR min_age <= max_age)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.packages.parent_package_id IS
  'Nullable self-FK. Child rows are nested sub-categories under a top-level package.';
COMMENT ON COLUMN public.package_tiers.min_age IS
  'Inclusive minimum age for this tier; NULL = no minimum (flat / family option).';
COMMENT ON COLUMN public.package_tiers.max_age IS
  'Inclusive maximum age for this tier; NULL = no maximum.';

-- ---------------------------------------------------------------------------
-- Welfare Package: keep family tiers; convert Individual → age bands + add 80+
-- ---------------------------------------------------------------------------
UPDATE public.package_tiers pt
SET
  name = 'Age 0-79',
  description = COALESCE(pt.description, 'Individual contribution for members aged 79 and below'),
  min_age = 0,
  max_age = 79,
  amount = 100,
  updated_at = now()
FROM public.packages p
WHERE pt.package_id = p.id
  AND p.code = 'welfare'
  AND pt.name IN ('Individual', 'Age 0-79')
  AND pt.is_active = true;

INSERT INTO public.package_tiers (package_id, name, amount, description, sort_order, min_age, max_age, is_active)
SELECT p.id, 'Age 80+', 400, 'Individual contribution for members aged 80 and above', 2, 80, NULL, true
FROM public.packages p
WHERE p.code = 'welfare'
  AND NOT EXISTS (
    SELECT 1 FROM public.package_tiers t
    WHERE t.package_id = p.id AND t.name = 'Age 80+'
  );

-- Keep Nuclear / Extended as unbounded family options; bump sort after age tiers
UPDATE public.package_tiers pt
SET sort_order = 3, updated_at = now()
FROM public.packages p
WHERE pt.package_id = p.id AND p.code = 'welfare' AND pt.name = 'Nuclear Family';

UPDATE public.package_tiers pt
SET sort_order = 4, updated_at = now()
FROM public.packages p
WHERE pt.package_id = p.id AND p.code = 'welfare' AND pt.name = 'Extended Family';

-- ---------------------------------------------------------------------------
-- Mission of Mercy (parent) + three joinable sub-categories @ KSh 500
-- Assumption (flagged in ORG_DOCS_AUDIT): each sub-category carries its own
-- flat KSh 500 tier so members join a specific nested option.
-- Descriptions from master document §4 / §8 (no invented benefit promises).
-- ---------------------------------------------------------------------------
INSERT INTO public.packages (code, name, description, coverage, waiting_period_months, is_active, sort_order)
SELECT
  'mission_of_mercy',
  'Mission of Mercy',
  'Our Mission of Mercy is the heart of LUMA Welfare: to stand with everyone. It encourages compassion toward members, families, vulnerable people, children and communities. Contribution KSh 500 per month with a 12-month waiting period. Nested focus areas: Children''s Orphanage/Vulnerables, Widows, and Single Mothers. Specific benefits follow approved package schedules.',
  ARRAY['Children / orphans / vulnerables', 'Widows', 'Single mothers', 'Community outreach']::text[],
  '12',
  true,
  13
WHERE NOT EXISTS (SELECT 1 FROM public.packages WHERE code = 'mission_of_mercy');

INSERT INTO public.package_rules (package_id, key, value, description)
SELECT p.id, v.key, to_jsonb(v.value), v.description
FROM public.packages p
CROSS JOIN (
  VALUES
    ('waiting_period_months', '12', '12 months of contributions.'),
    ('min_contributions', '12', 'At least 12 contributions.'),
    ('requires_current_contributions', 'true', 'Contributions must be current.')
) AS v(key, value, description)
WHERE p.code = 'mission_of_mercy'
  AND NOT EXISTS (
    SELECT 1 FROM public.package_rules r
    WHERE r.package_id = p.id AND r.key = v.key
  );

-- Sub-categories (joinable)
INSERT INTO public.packages (code, name, description, coverage, waiting_period_months, is_active, sort_order, parent_package_id)
SELECT
  'mission_children',
  'Children''s Orphanage/Vulnerables',
  'Mission of Mercy focus area for children''s orphanage and vulnerable children support. Contribution KSh 500 per month with a 12-month waiting period. Benefits follow approved package schedules.',
  ARRAY['Children / orphans', 'Vulnerable children']::text[],
  '12',
  true,
  14,
  (SELECT id FROM public.packages WHERE code = 'mission_of_mercy' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM public.packages WHERE code = 'mission_children');

INSERT INTO public.packages (code, name, description, coverage, waiting_period_months, is_active, sort_order, parent_package_id)
SELECT
  'mission_widows',
  'Widows',
  'Mission of Mercy focus area for widows support. Contribution KSh 500 per month with a 12-month waiting period. Benefits follow approved package schedules.',
  ARRAY['Widows support']::text[],
  '12',
  true,
  15,
  (SELECT id FROM public.packages WHERE code = 'mission_of_mercy' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM public.packages WHERE code = 'mission_widows');

INSERT INTO public.packages (code, name, description, coverage, waiting_period_months, is_active, sort_order, parent_package_id)
SELECT
  'mission_single_mothers',
  'Single Mothers',
  'Mission of Mercy focus area for single mothers support. Contribution KSh 500 per month with a 12-month waiting period. Benefits follow approved package schedules.',
  ARRAY['Single mothers support']::text[],
  '12',
  true,
  16,
  (SELECT id FROM public.packages WHERE code = 'mission_of_mercy' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM public.packages WHERE code = 'mission_single_mothers');

-- Flat KSh 500 tiers on each sub-category (and parent for catalog display)
INSERT INTO public.package_tiers (package_id, name, amount, sort_order, is_active)
SELECT p.id, 'Standard', 500, 1, true
FROM public.packages p
WHERE p.code IN ('mission_of_mercy', 'mission_children', 'mission_widows', 'mission_single_mothers')
  AND NOT EXISTS (
    SELECT 1 FROM public.package_tiers t
    WHERE t.package_id = p.id AND t.name = 'Standard'
  );

INSERT INTO public.package_rules (package_id, key, value, description)
SELECT p.id, v.key, to_jsonb(v.value), v.description
FROM public.packages p
CROSS JOIN (
  VALUES
    ('waiting_period_months', '12', '12 months of contributions.'),
    ('min_contributions', '12', 'At least 12 contributions.'),
    ('requires_current_contributions', 'true', 'Contributions must be current.')
) AS v(key, value, description)
WHERE p.code IN ('mission_children', 'mission_widows', 'mission_single_mothers')
  AND NOT EXISTS (
    SELECT 1 FROM public.package_rules r
    WHERE r.package_id = p.id AND r.key = v.key
  );
