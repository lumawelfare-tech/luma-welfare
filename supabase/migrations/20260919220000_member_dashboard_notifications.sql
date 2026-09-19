-- ============================================================================
-- Member dashboard / notifications / realtime (2026-09-19)
-- Additive only. Does not alter payment state machine or STK logic.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. notifications: type + meta for typed in-app alerts
-- ---------------------------------------------------------------------------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'system';

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_type_check'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_type_check
      CHECK (type IN (
        'payment_confirmed',
        'payment_failed',
        'contribution_reminder',
        'admin_announcement',
        'system'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_member_type_created
  ON notifications (member_id, type, created_at DESC);

-- Members may mark own notifications read (queued → sent only)
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE
  USING (member_id = auth.uid())
  WITH CHECK (
    member_id = auth.uid()
    AND status IN ('queued', 'sent')
  );

-- ---------------------------------------------------------------------------
-- 2. announcements (admin fan-out audit; members never read directly)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid NOT NULL REFERENCES admins(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- No member/anon policies — service_role / admin EFs only
DROP POLICY IF EXISTS "announcements_admin_read" ON announcements;
CREATE POLICY "announcements_admin_read" ON announcements
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins a
      WHERE a.id = auth.uid() AND a.is_active = true
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Realtime publication (required for live payment + bell updates)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE payments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'contributions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE contributions;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Member dashboard summary view (security invoker — respects RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW member_dashboard_summary
WITH (security_invoker = true) AS
SELECT
  m.id AS member_id,
  COALESCE(SUM(c.amount) FILTER (
    WHERE c.status IN ('Paid', 'Verified', 'Late')
  ), 0)::numeric AS total_contributed
FROM members m
LEFT JOIN contributions c ON c.member_id = m.id
WHERE m.id = auth.uid()
GROUP BY m.id;

GRANT SELECT ON member_dashboard_summary TO authenticated;
