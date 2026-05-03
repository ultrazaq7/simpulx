-- Migration: Add department_ids to whatsapp_templates
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS department_ids JSONB DEFAULT '[]';
