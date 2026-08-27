-- =============================================================================
-- SYSTEM WEBHOOKS — Configurable alert webhooks for Slack, Discord, custom
-- Stores webhook URLs and event subscriptions for operational alerts.
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_webhooks (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('slack', 'discord', 'custom')),
  events      TEXT[] NOT NULL DEFAULT ARRAY['health.unhealthy', 'health.degraded'],
  enabled     BOOLEAN NOT NULL DEFAULT true,
  last_sent   TIMESTAMPTZ,
  last_status INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for enabled webhooks
CREATE INDEX IF NOT EXISTS idx_system_webhooks_enabled
  ON system_webhooks (enabled) WHERE enabled = true;

-- RLS — admin-only via Edge Functions
ALTER TABLE system_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only"
  ON system_webhooks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Block authenticated"
  ON system_webhooks
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Block anon"
  ON system_webhooks
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- RPC to get all webhooks (admin-only via Edge Function)
CREATE OR REPLACE FUNCTION get_system_webhooks()
RETURNS TABLE (
  id UUID,
  name TEXT,
  url TEXT,
  type TEXT,
  events TEXT[],
  enabled BOOLEAN,
  last_sent TIMESTAMPTZ,
  last_status INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE SQL STABLE
AS $$
  SELECT w.id, w.name, w.url, w.type, w.events, w.enabled,
         w.last_sent, w.last_status, w.created_at, w.updated_at
  FROM system_webhooks w
  ORDER BY w.created_at DESC;
$$;

-- RPC to get enabled webhooks for a specific event (used by cron)
CREATE OR REPLACE FUNCTION get_active_webhooks_for_event(p_event TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  url TEXT,
  type TEXT
)
LANGUAGE SQL STABLE
AS $$
  SELECT w.id, w.name, w.url, w.type
  FROM system_webhooks w
  WHERE w.enabled = true
    AND p_event = ANY(w.events);
$$;

-- RPC to record webhook delivery
CREATE OR REPLACE FUNCTION record_webhook_delivery(
  p_webhook_id UUID,
  p_status INTEGER
)
RETURNS VOID
LANGUAGE SQL
AS $$
  UPDATE system_webhooks
  SET last_sent = now(),
      last_status = p_status,
      updated_at = now()
  WHERE id = p_webhook_id;
$$;

COMMENT ON TABLE system_webhooks IS 'Configurable alert webhooks for Slack, Discord, and custom endpoints';
COMMENT ON FUNCTION get_system_webhooks IS 'Returns all webhook configurations for admin management';
COMMENT ON FUNCTION get_active_webhooks_for_event IS 'Returns enabled webhooks subscribed to a specific event';
COMMENT ON FUNCTION record_webhook_delivery IS 'Records the last delivery status for a webhook';
