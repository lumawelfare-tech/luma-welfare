-- SECURITY FIX: Remove the UPDATE policy on registration_fees.
-- Members must NOT be able to update their own registration fee status.
-- Only service-role (admin, M-Pesa callback) can change fee status.
-- This prevents members from self-marking their fee as 'paid'.

drop policy if exists "registration_fees_update_own" on registration_fees;
