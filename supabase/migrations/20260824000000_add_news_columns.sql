-- Add missing columns to news_events for content management
ALTER TABLE news_events ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE news_events ADD COLUMN IF NOT EXISTS excerpt text;
ALTER TABLE news_events ADD COLUMN IF NOT EXISTS cover_image text;
ALTER TABLE news_events ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE news_events ADD COLUMN IF NOT EXISTS event_time text;
ALTER TABLE news_events ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;

-- Unique index on slug (partial — only when slug is non-empty)
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_events_slug 
  ON news_events (slug) 
  WHERE slug IS NOT NULL AND slug != '';
