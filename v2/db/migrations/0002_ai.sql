-- ============================================================
-- Simpulx v2 — AI-first layer (LLM agents, RAG, jejak/audit AI)
-- Catatan: kolom embedding berdimensi 1536 (cocok untuk
-- embedder lokal & OpenAI text-embedding-3-small). Bila ganti
-- EMBED_DIM, sesuaikan dimensi vector di sini.
-- ============================================================

-- ── AI agents (persona/konfigurasi per org) ─────────────────
CREATE TABLE ai_agents (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            varchar(120) NOT NULL,
    system_prompt   text NOT NULL DEFAULT 'You are a helpful customer support assistant.',
    model           varchar(80)  NOT NULL DEFAULT 'claude-opus-4-8',
    temperature     numeric(3,2) NOT NULL DEFAULT 0.30,
    -- mode: auto = AI balas langsung; suggest = AI hanya menyarankan ke agen
    mode            varchar(20)  NOT NULL DEFAULT 'auto',
    -- ambang: di bawah confidence ini -> handoff ke manusia
    handoff_threshold numeric(3,2) NOT NULL DEFAULT 0.55,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_agents_org ON ai_agents(organization_id);

-- FK conversations.ai_agent_id (tabel conversations dibuat di 0001)
ALTER TABLE conversations
    ADD CONSTRAINT fk_conv_ai_agent
    FOREIGN KEY (ai_agent_id) REFERENCES ai_agents(id) ON DELETE SET NULL;

-- ── Knowledge sources (dokumen/FAQ/URL untuk RAG) ───────────
CREATE TABLE knowledge_sources (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title           varchar(255) NOT NULL,
    source_type     varchar(30)  NOT NULL DEFAULT 'text',  -- text|faq|url|file
    uri             text,
    status          varchar(20)  NOT NULL DEFAULT 'ready',  -- pending|processing|ready|failed
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_know_src_org ON knowledge_sources(organization_id);

-- ── Knowledge chunks (text + embedding pgvector) ────────────
CREATE TABLE knowledge_chunks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source_id       uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    chunk_index     integer NOT NULL DEFAULT 0,
    content         text NOT NULL,
    embedding       vector(1536),
    token_count     integer,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_chunks_org ON knowledge_chunks(organization_id);
-- ANN index (cosine). ivfflat butuh data utk training; aman dibuat lebih awal.
CREATE INDEX idx_chunks_embedding ON knowledge_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ── AI tools (function-calling per org) ─────────────────────
CREATE TABLE ai_tools (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            varchar(80) NOT NULL,     -- e.g. check_order_status
    description     text NOT NULL,
    input_schema    jsonb NOT NULL DEFAULT '{}',  -- JSON Schema utk argumen
    endpoint_url    text,                     -- internal endpoint yg dipanggil
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);

-- ── AI runs (jejak tiap pemanggilan LLM: audit & evaluasi) ──
CREATE TABLE ai_runs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
    ai_agent_id     uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
    input_text      text,
    retrieved_chunk_ids uuid[] NOT NULL DEFAULT '{}',
    tool_calls      jsonb NOT NULL DEFAULT '[]',
    output_text     text,
    decision        varchar(20),               -- reply|handoff|noop
    confidence      numeric(5,4),
    model           varchar(80),
    prompt_tokens   integer,
    completion_tokens integer,
    latency_ms      integer,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_runs_conv ON ai_runs(conversation_id, created_at);
