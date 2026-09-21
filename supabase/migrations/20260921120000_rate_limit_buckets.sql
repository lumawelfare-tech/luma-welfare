-- Distributed rate-limit buckets for Edge Functions.
-- Atomic consume via a single SECURITY DEFINER RPC (service_role only).

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  hit_count integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_reset_at
  ON public.rate_limit_buckets (reset_at);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated/anon — service_role bypasses RLS.

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key text,
  p_window_ms integer,
  p_max integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_reset timestamptz;
  v_count integer;
  v_allowed boolean;
  v_remaining integer;
BEGIN
  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RAISE EXCEPTION 'rate limit key required';
  END IF;
  IF p_window_ms IS NULL OR p_window_ms < 1000 THEN
    RAISE EXCEPTION 'invalid window';
  END IF;
  IF p_max IS NULL OR p_max < 1 THEN
    RAISE EXCEPTION 'invalid max';
  END IF;

  INSERT INTO public.rate_limit_buckets (bucket_key, hit_count, reset_at, updated_at)
  VALUES (p_key, 1, v_now + make_interval(secs => p_window_ms / 1000.0), v_now)
  ON CONFLICT (bucket_key) DO UPDATE
  SET
    hit_count = CASE
      WHEN rate_limit_buckets.reset_at <= v_now THEN 1
      ELSE rate_limit_buckets.hit_count + 1
    END,
    reset_at = CASE
      WHEN rate_limit_buckets.reset_at <= v_now
        THEN v_now + make_interval(secs => p_window_ms / 1000.0)
      ELSE rate_limit_buckets.reset_at
    END,
    updated_at = v_now
  RETURNING hit_count, reset_at INTO v_count, v_reset;

  v_allowed := v_count <= p_max;
  v_remaining := GREATEST(p_max - v_count, 0);

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'count', v_count,
    'remaining', v_remaining,
    'reset_at', v_reset,
    'max', p_max
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

COMMENT ON FUNCTION public.consume_rate_limit IS
  'Atomically increment a rate-limit bucket; service_role only.';
