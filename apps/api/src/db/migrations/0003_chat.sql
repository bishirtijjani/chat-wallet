-- M2 — Chat core (see docs/PROJECT_BIBLE.md §3.4).
-- Conversations are 'direct' (1:1) or 'group'. A ROSCA circle will own one
-- group conversation (circle_id, wired in M3). Money events post here as
-- 'system' messages.

CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL CHECK (type IN ('direct', 'group')),
  title       TEXT,                                  -- set for groups
  circle_id   UUID,                                  -- reserved for M3
  -- Canonical key for a 1:1 conversation: the two user ids sorted and joined,
  -- so a direct conversation between A and B is unique regardless of who opens it.
  dm_key      TEXT,
  created_by  UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (type = 'group'  AND dm_key IS NULL) OR
    (type = 'direct' AND dm_key IS NOT NULL AND title IS NULL)
  )
);

CREATE UNIQUE INDEX idx_conversations_dm_key
  ON conversations (dm_key)
  WHERE type = 'direct';

CREATE TABLE conversation_members (
  conversation_id  UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role             TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  last_read_seq    BIGINT NOT NULL DEFAULT 0,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_conversation_members_user ON conversation_members (user_id);

-- Global sequence backing each message's ordering cursor.
CREATE SEQUENCE messages_seq;

CREATE TABLE messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  -- Per-conversation monotonic cursor for ordering and read tracking. Assigned
  -- from a global sequence; strictly increasing, gaps are fine.
  seq              BIGINT NOT NULL DEFAULT nextval('messages_seq'),
  sender_id        UUID REFERENCES users (id) ON DELETE SET NULL,  -- NULL = system
  type             TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'system', 'image')),
  body             TEXT NOT NULL,
  metadata         JSONB NOT NULL DEFAULT '{}',
  -- Optional idempotency for client-sent messages (retries don't duplicate).
  idempotency_key  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (type = 'system' OR sender_id IS NOT NULL)
);

CREATE INDEX idx_messages_conversation_seq ON messages (conversation_id, seq DESC);

CREATE UNIQUE INDEX idx_messages_idempotency
  ON messages (conversation_id, sender_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
