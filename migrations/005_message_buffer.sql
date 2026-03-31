-- Message buffer for debounce: shares state across concurrent n8n executions
-- Used by FitAI - Process text message workflow
CREATE TABLE IF NOT EXISTS message_buffer (
  chat_id   BIGINT PRIMARY KEY,
  text      TEXT    NOT NULL DEFAULT '',
  last_ts   BIGINT  NOT NULL DEFAULT 0  -- ms timestamp of the last writer
);
