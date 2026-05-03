-- Migration: Add FCM push notification columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_platform VARCHAR(20);
