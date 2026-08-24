-- Make phone nullable for OAuth users who don't have a phone number
ALTER TABLE members ALTER COLUMN phone DROP NOT NULL;
