-- ============================================================
-- Media Library: dedicated media_items table, RLS, indexes
-- ============================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS media_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  description   TEXT,
  media_type    TEXT NOT NULL DEFAULT 'image',          -- image | video | audio | document
  file_url      TEXT NOT NULL,                           -- public URL from Storage
  storage_path  TEXT,                                    -- bucket-relative path
  thumbnail_url TEXT,
  mime_type     TEXT,
  file_size     BIGINT,                                 -- bytes
  duration      REAL,                                    -- seconds (audio/video)
  category      TEXT,                                    -- free-text category
  tags          TEXT[],                                  -- array of tags
  is_published  BOOLEAN NOT NULL DEFAULT false,
  is_featured   BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID                                     -- admin user id
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_media_items_published   ON media_items (is_published);
CREATE INDEX IF NOT EXISTS idx_media_items_type        ON media_items (media_type);
CREATE INDEX IF NOT EXISTS idx_media_items_category    ON media_items (category);
CREATE INDEX IF NOT EXISTS idx_media_items_featured    ON media_items (is_featured);
CREATE INDEX IF NOT EXISTS idx_media_items_created     ON media_items (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_items_sort        ON media_items (sort_order);
CREATE INDEX IF NOT EXISTS idx_media_items_title_trgm  ON media_items USING gin (title gin_trgm_ops);

-- 3. RLS
ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;

-- Public read: only published rows
CREATE POLICY media_items_public_read ON media_items
  FOR SELECT USING (is_published = true);

-- Admin full access via service-role (RLS bypassed by adminClient)

-- 4. updated_at trigger
CREATE OR REPLACE FUNCTION update_media_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_media_items_updated_at ON media_items;
CREATE TRIGGER trg_media_items_updated_at
  BEFORE UPDATE ON media_items
  FOR EACH ROW
  EXECUTE FUNCTION update_media_items_updated_at();

-- 5. Storage bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- 6. Storage policies
-- Public can read objects in the media bucket
DROP POLICY IF EXISTS media_storage_public_read ON storage.objects;
CREATE POLICY media_storage_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'media');

-- Only authenticated admins can upload via service-role (RLS bypassed)
-- These policies are for completeness; admin operations use the service-role client.
DROP POLICY IF EXISTS media_storage_admin_insert ON storage.objects;
CREATE POLICY media_storage_admin_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS media_storage_admin_update ON storage.objects;
CREATE POLICY media_storage_admin_update ON storage.objects
  FOR UPDATE USING (bucket_id = 'media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS media_storage_admin_delete ON storage.objects;
CREATE POLICY media_storage_admin_delete ON storage.objects
  FOR DELETE USING (bucket_id = 'media' AND auth.role() = 'authenticated');
