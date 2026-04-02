-- Add deliveryman auth fields
ALTER TABLE "deliverymen"
  ADD COLUMN IF NOT EXISTS "password" TEXT,
  ADD COLUMN IF NOT EXISTS "refresh_token_hash" TEXT;

-- Extend chat enums
ALTER TYPE "ChatThreadSource" ADD VALUE IF NOT EXISTS 'DELIVERY';
ALTER TYPE "ChatMessageSenderType" ADD VALUE IF NOT EXISTS 'DELIVERYMAN';

-- Add delivery thread ownership and deliveryman message sender
ALTER TABLE "chat_threads"
  ADD COLUMN IF NOT EXISTS "deliveryman_id" TEXT;

ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "sender_deliveryman_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'chat_threads_deliveryman_id_fkey'
      AND table_name = 'chat_threads'
  ) THEN
    ALTER TABLE "chat_threads"
      ADD CONSTRAINT "chat_threads_deliveryman_id_fkey"
      FOREIGN KEY ("deliveryman_id") REFERENCES "deliverymen"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'chat_messages_sender_deliveryman_id_fkey'
      AND table_name = 'chat_messages'
  ) THEN
    ALTER TABLE "chat_messages"
      ADD CONSTRAINT "chat_messages_sender_deliveryman_id_fkey"
      FOREIGN KEY ("sender_deliveryman_id") REFERENCES "deliverymen"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "chat_threads_deliveryman_id_status_last_message_at_idx"
  ON "chat_threads"("deliveryman_id", "status", "last_message_at");

CREATE INDEX IF NOT EXISTS "chat_messages_sender_deliveryman_id_created_at_idx"
  ON "chat_messages"("sender_deliveryman_id", "created_at");
