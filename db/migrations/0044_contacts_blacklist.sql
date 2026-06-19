-- +goose Up
-- Allow blacklisting a contact (shown in the Contacts table; blocks outreach).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS blacklisted boolean NOT NULL DEFAULT false;
