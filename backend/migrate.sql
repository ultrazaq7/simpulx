DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'drip_campaigns_status_enum') THEN CREATE TYPE drip_campaigns_status_enum AS ENUM ('draft','active','paused','completed'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'drip_steps_steptype_enum') THEN CREATE TYPE drip_steps_steptype_enum AS ENUM ('delay','message','template','condition','tag'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'drip_enrollments_status_enum') THEN CREATE TYPE drip_enrollments_status_enum AS ENUM ('active','completed','exited','paused'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_logs_category_enum') THEN CREATE TYPE audit_logs_category_enum AS ENUM ('auth','chat','contact','settings','automation','broadcast','ticket','user','system'); END IF; END $$;

CREATE TABLE IF NOT EXISTS drip_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  name VARCHAR NOT NULL,
  description VARCHAR,
  status drip_campaigns_status_enum DEFAULT 'draft',
  "triggerConditions" JSONB DEFAULT '[]',
  "enrolledCount" INT DEFAULT 0,
  "completedCount" INT DEFAULT 0,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drip_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "campaignId" UUID NOT NULL REFERENCES drip_campaigns(id) ON DELETE CASCADE,
  "stepType" drip_steps_steptype_enum NOT NULL,
  "sortOrder" INT DEFAULT 0,
  config JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drip_enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "campaignId" UUID NOT NULL REFERENCES drip_campaigns(id) ON DELETE CASCADE,
  "contactId" UUID NOT NULL,
  "currentStepIndex" INT DEFAULT 0,
  status drip_enrollments_status_enum DEFAULT 'active',
  "nextExecutionAt" TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  "enrolledAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  category audit_logs_category_enum NOT NULL,
  action VARCHAR NOT NULL,
  "userId" UUID,
  "userName" VARCHAR,
  "targetId" VARCHAR,
  "targetType" VARCHAR,
  metadata JSONB DEFAULT '{}',
  "ipAddress" VARCHAR,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs ("organizationId", "createdAt");

-- Broadcasts table (new columns for template-based sending)
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS "broadcastType" VARCHAR DEFAULT 'text';
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS "channelId" UUID;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS "templateName" VARCHAR;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS "languageCode" VARCHAR DEFAULT 'en_US';
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS "templateComponents" JSONB;
ALTER TABLE broadcasts ALTER COLUMN message DROP NOT NULL;
