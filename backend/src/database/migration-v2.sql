-- Add manager role
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'manager' BEFORE 'supervisor';

-- Create departments table
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create whatsapp_channels table
CREATE TABLE IF NOT EXISTS whatsapp_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id),
  name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50) NOT NULL,
  phone_number_id VARCHAR(100) NOT NULL,
  business_account_id VARCHAR(100),
  access_token TEXT NOT NULL,
  webhook_verify_token VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  status VARCHAR(50) DEFAULT 'disconnected',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add new columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;

-- Add new columns to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS whatsapp_channel_id UUID REFERENCES whatsapp_channels(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_departments_org ON departments(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_channels_org ON whatsapp_channels(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_dept ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_supervisor ON users(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_conversations_dept ON conversations(department_id);
