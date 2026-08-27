-- Push Notification Subscriptions
-- Stores Web Push API subscriptions for sending push notifications

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, endpoint)
);

-- RLS: members can only read/update their own subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions_read_own"
  ON push_subscriptions FOR SELECT
  USING (member_id = auth.uid());

CREATE POLICY "push_subscriptions_insert_own"
  ON push_subscriptions FOR INSERT
  WITH CHECK (member_id = auth.uid());

CREATE POLICY "push_subscriptions_update_own"
  ON push_subscriptions FOR UPDATE
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

CREATE POLICY "push_subscriptions_delete_own"
  ON push_subscriptions FOR DELETE
  USING (member_id = auth.uid());

-- Index for fast lookup by member
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_member
  ON push_subscriptions(member_id);

-- Index for active subscriptions (used when sending push notifications)
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active
  ON push_subscriptions(is_active)
  WHERE is_active = true;

-- updated_at trigger
CREATE TRIGGER trg_push_subscriptions_updated
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Add push_enabled to notification_preferences
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN NOT NULL DEFAULT true;

-- Function to get active push subscriptions for a member
CREATE OR REPLACE FUNCTION get_member_push_subscriptions(p_member_id UUID)
RETURNS TABLE (
  endpoint TEXT,
  p256dh TEXT,
  auth TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT ps.endpoint, ps.p256dh, ps.auth
  FROM push_subscriptions ps
  WHERE ps.member_id = p_member_id
    AND ps.is_active = true;
END;
$$;

-- Function to get all active push subscriptions (for admin broadcast)
CREATE OR REPLACE FUNCTION get_all_active_push_subscriptions()
RETURNS TABLE (
  member_id UUID,
  endpoint TEXT,
  p256dh TEXT,
  auth TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT ps.member_id, ps.endpoint, ps.p256dh, ps.auth
  FROM push_subscriptions ps
  WHERE ps.is_active = true;
END;
$$;

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION get_member_push_subscriptions TO authenticated;
