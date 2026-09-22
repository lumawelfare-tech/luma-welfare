-- ============================================================================
-- Phase 7: RAG foundation — kb_chunks for approved public/member knowledge only
-- Fail-closed assistant (AI_ASSISTANT_ENABLED). No claim/payment/PII ingestion.
-- Does not enable M-Pesa. Embeddings optional (nullable vector).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.kb_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL
    CHECK (source_type IN ('faq', 'about', 'kb_document')),
  source_id text NOT NULL,
  access_level text NOT NULL DEFAULT 'public'
    CHECK (access_level IN ('public', 'member')),
  title text NOT NULL,
  content text NOT NULL,
  chunk_index int NOT NULL DEFAULT 0 CHECK (chunk_index >= 0),
  content_hash text,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kb_chunks_title_len CHECK (char_length(title) BETWEEN 1 AND 300),
  CONSTRAINT kb_chunks_content_len CHECK (char_length(content) BETWEEN 1 AND 8000),
  CONSTRAINT kb_chunks_source_unique UNIQUE (source_type, source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS kb_chunks_access_created_idx
  ON public.kb_chunks (access_level, created_at DESC);

CREATE INDEX IF NOT EXISTS kb_chunks_source_idx
  ON public.kb_chunks (source_type, source_id);

CREATE INDEX IF NOT EXISTS kb_chunks_content_trgm_idx
  ON public.kb_chunks USING gin (content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS kb_chunks_title_trgm_idx
  ON public.kb_chunks USING gin (title gin_trgm_ops);

-- Vector ANN index deferred until embeddings are populated (empty IVFFlat can fail).

ALTER TABLE public.kb_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_chunks FORCE ROW LEVEL SECURITY;

-- No anon/authenticated policies — service_role / Edge Functions only
DROP POLICY IF EXISTS "kb_chunks_admin_read" ON public.kb_chunks;
CREATE POLICY "kb_chunks_admin_read" ON public.kb_chunks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admins a
      WHERE a.id = auth.uid() AND a.is_active = true
    )
  );

-- Text search helper (members never call directly; Edge uses service_role)
CREATE OR REPLACE FUNCTION public.search_kb_chunks(
  p_query text,
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  source_type text,
  source_id text,
  access_level text,
  title text,
  content text,
  rank real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q text := left(trim(coalesce(p_query, '')), 200);
  lim int := greatest(1, least(coalesce(p_limit, 5), 10));
BEGIN
  IF length(q) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.source_type,
    c.source_id,
    c.access_level,
    c.title,
    c.content,
    greatest(
      similarity(c.title, q),
      similarity(c.content, q),
      CASE WHEN c.title ILIKE '%' || q || '%' THEN 0.4 ELSE 0 END,
      CASE WHEN c.content ILIKE '%' || q || '%' THEN 0.3 ELSE 0 END
    )::real AS rank
  FROM public.kb_chunks c
  WHERE c.access_level IN ('public', 'member')
    AND (
      c.title ILIKE '%' || q || '%'
      OR c.content ILIKE '%' || q || '%'
      OR similarity(c.title, q) > 0.15
      OR similarity(c.content, q) > 0.1
    )
  ORDER BY rank DESC
  LIMIT lim;
END;
$$;

REVOKE ALL ON FUNCTION public.search_kb_chunks(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_kb_chunks(text, int) TO service_role;

COMMENT ON TABLE public.kb_chunks IS 'Phase 7 RAG chunks — FAQ/About/approved public|member KB only. Never member PII or claims.';
COMMENT ON FUNCTION public.search_kb_chunks IS 'Service-role text search over safe kb_chunks only.';
