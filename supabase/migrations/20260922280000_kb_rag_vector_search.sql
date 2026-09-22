-- ============================================================================
-- Phase 7b: Vector similarity search for kb_chunks (RAG completion)
-- Reuses embedding vector(1536). Service-role only. Public/member access only.
-- Does not change document approval status. Does not enable M-Pesa.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.kb_chunks
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.kb_chunks.metadata IS
  'Safe attribution metadata (document version_label, category). Never store PII or storage paths for member responses.';

-- ANN index deferred until embeddings are populated (empty IVFFlat can fail).
-- Sequential cosine scan is fine for small approved public/member KB corpora.

CREATE OR REPLACE FUNCTION public.match_kb_chunks(
  p_query_embedding vector(1536),
  p_match_count int DEFAULT 5,
  p_match_threshold float DEFAULT 0.55
)
RETURNS TABLE (
  id uuid,
  source_type text,
  source_id text,
  access_level text,
  title text,
  content text,
  metadata jsonb,
  rank real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim int := greatest(1, least(coalesce(p_match_count, 5), 10));
  thr real := greatest(0.0, least(coalesce(p_match_threshold, 0.55), 0.99));
BEGIN
  IF p_query_embedding IS NULL THEN
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
    c.metadata,
    (1 - (c.embedding <=> p_query_embedding))::real AS rank
  FROM public.kb_chunks c
  WHERE c.access_level IN ('public', 'member')
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> p_query_embedding)) >= thr
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT lim;
END;
$$;

REVOKE ALL ON FUNCTION public.match_kb_chunks(vector(1536), int, float) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_kb_chunks(vector(1536), int, float) TO service_role;

COMMENT ON FUNCTION public.match_kb_chunks IS
  'Service-role cosine similarity over approved public/member kb_chunks embeddings only.';
