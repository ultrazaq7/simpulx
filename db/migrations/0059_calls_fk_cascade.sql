-- +goose Up
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_conversation_id_fkey;
ALTER TABLE calls ADD CONSTRAINT calls_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- +goose Down
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_conversation_id_fkey;
ALTER TABLE calls ADD CONSTRAINT calls_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id);
