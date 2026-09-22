-- ============================================================================
-- Mission of Mercy public descriptions — replace DRAFT placeholders with
-- official master-document wording (no invented benefit promises).
-- Idempotent UPDATEs only.
-- ============================================================================

UPDATE public.packages
SET
  description = $desc$Our Mission of Mercy is the heart of LUMA Welfare: to stand with everyone. It encourages compassion toward members, families, vulnerable people, children and communities. Contribution KSh 500 per month with a 12-month waiting period. Nested focus areas: Children's Orphanage/Vulnerables, Widows, and Single Mothers. Specific benefits follow approved package schedules.$desc$,
  updated_at = now()
WHERE code = 'mission_of_mercy';

UPDATE public.packages
SET
  description = $desc$Mission of Mercy focus area for children's orphanage and vulnerable children support. Contribution KSh 500 per month with a 12-month waiting period. Benefits follow approved package schedules.$desc$,
  updated_at = now()
WHERE code = 'mission_children';

UPDATE public.packages
SET
  description = $desc$Mission of Mercy focus area for widows support. Contribution KSh 500 per month with a 12-month waiting period. Benefits follow approved package schedules.$desc$,
  updated_at = now()
WHERE code = 'mission_widows';

UPDATE public.packages
SET
  description = $desc$Mission of Mercy focus area for single mothers support. Contribution KSh 500 per month with a 12-month waiting period. Benefits follow approved package schedules.$desc$,
  updated_at = now()
WHERE code = 'mission_single_mothers';
