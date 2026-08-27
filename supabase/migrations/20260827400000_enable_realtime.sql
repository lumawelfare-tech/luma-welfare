-- Phase 10: Enable Supabase Realtime for live member updates
-- Members receive Realtime events only for their own rows (RLS filtered).

-- Enable Realtime on key tables
ALTER PUBLICATION supabase_realtime ADD TABLE claims;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER PUBLICATION supabase_realtime ADD TABLE contributions;
