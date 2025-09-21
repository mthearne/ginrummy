BEGIN;

-- Ensure GameType enum matches Prisma schema
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GameType') THEN
    IF EXISTS (
      SELECT 1 FROM pg_enum e
      WHERE e.enumtypid = '"GameType"'::regtype
        AND e.enumlabel = 'TOURNAMENT'
    ) THEN
      CREATE TYPE "GameType_new" AS ENUM ('STANDARD', 'HOLLYWOOD', 'OKLAHOMA');
      ALTER TABLE "games" ALTER COLUMN "game_type" DROP DEFAULT;
      ALTER TABLE "games" ALTER COLUMN "game_type" TYPE "GameType_new" USING ("game_type"::text::"GameType_new");
      ALTER TYPE "GameType" RENAME TO "GameType_old";
      ALTER TYPE "GameType_new" RENAME TO "GameType";
      DROP TYPE "GameType_old";
      ALTER TABLE "games" ALTER COLUMN "game_type" SET DEFAULT 'STANDARD';
    END IF;
  END IF;
END
$$;

-- Create NotificationType enum if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
    CREATE TYPE "NotificationType" AS ENUM (
      'FRIEND_REQUEST',
      'FRIEND_REQUEST_ACCEPTED',
      'GAME_INVITATION',
      'INVITATION_RESPONSE',
      'GAME_STARTED',
      'GAME_ENDED',
      'CHAT_MESSAGE',
      'PLAYER_JOINED',
      'TURN_NOTIFICATION',
      'OPPONENT_MOVE'
    );
  END IF;
END
$$;

-- Drop existing foreign keys that will be recreated with Prisma naming
ALTER TABLE IF EXISTS "chat_messages" DROP CONSTRAINT IF EXISTS "fk_chat_messages_sender";
ALTER TABLE IF EXISTS "chat_messages" DROP CONSTRAINT IF EXISTS "fk_chat_messages_receiver";
ALTER TABLE IF EXISTS "game_participants" DROP CONSTRAINT IF EXISTS "game_participants_game_id_fkey";
ALTER TABLE IF EXISTS "game_participants" DROP CONSTRAINT IF EXISTS "game_participants_user_id_fkey";
ALTER TABLE IF EXISTS "game_snapshots" DROP CONSTRAINT IF EXISTS "game_snapshots_game_id_fkey";
ALTER TABLE IF EXISTS "games" DROP CONSTRAINT IF EXISTS "games_current_player_fkey";
ALTER TABLE IF EXISTS "notifications" DROP CONSTRAINT IF EXISTS "notifications_user_id_fkey";
ALTER TABLE IF EXISTS "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";

-- Align chat_messages column shapes
ALTER TABLE "chat_messages"
  ALTER COLUMN "id" TYPE TEXT USING "id"::text,
  ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text,
  ALTER COLUMN "sender_id" TYPE TEXT,
  ALTER COLUMN "receiver_id" TYPE TEXT,
  ALTER COLUMN "sent_at" TYPE TIMESTAMP(3) USING "sent_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "read_at" TYPE TIMESTAMP(3) USING CASE WHEN "read_at" IS NULL THEN NULL ELSE "read_at" AT TIME ZONE 'UTC' END,
  ALTER COLUMN "created_at" TYPE TIMESTAMP(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" DROP DEFAULT,
  ALTER COLUMN "updated_at" TYPE TIMESTAMP(3) USING "updated_at" AT TIME ZONE 'UTC';

-- Align game_events column shapes
ALTER TABLE "game_events"
  ALTER COLUMN "sequence_number" SET NOT NULL,
  ALTER COLUMN "event_version" SET NOT NULL,
  ALTER COLUMN "event_version" SET DEFAULT 1,
  ALTER COLUMN "processed" SET NOT NULL,
  ALTER COLUMN "processed" SET DEFAULT false,
  ALTER COLUMN "processed_at" TYPE TIMESTAMP(3) USING CASE WHEN "processed_at" IS NULL THEN NULL ELSE "processed_at" AT TIME ZONE 'UTC' END,
  ALTER COLUMN "request_id" TYPE TEXT;

-- Align game_participants column shapes
ALTER TABLE "game_participants"
  ALTER COLUMN "id" TYPE TEXT USING "id"::text,
  ALTER COLUMN "game_id" TYPE TEXT USING "game_id"::text,
  ALTER COLUMN "user_id" TYPE TEXT USING "user_id"::text,
  ALTER COLUMN "role" SET NOT NULL,
  ALTER COLUMN "role" TYPE TEXT,
  ALTER COLUMN "joined_at" SET NOT NULL,
  ALTER COLUMN "joined_at" TYPE TIMESTAMP(3) USING "joined_at";

-- Align game_snapshots column shapes
ALTER TABLE "game_snapshots"
  ALTER COLUMN "id" TYPE TEXT USING "id"::text,
  ALTER COLUMN "created_at" SET NOT NULL,
  ALTER COLUMN "created_at" TYPE TIMESTAMP(3) USING "created_at" AT TIME ZONE 'UTC';

-- Align games column shapes
ALTER TABLE "games"
  ALTER COLUMN "game_type" TYPE "GameType" USING "game_type"::text::"GameType",
  ALTER COLUMN "event_count" SET NOT NULL,
  ALTER COLUMN "stream_version" SET NOT NULL,
  ALTER COLUMN "last_event_at" TYPE TIMESTAMP(3) USING CASE WHEN "last_event_at" IS NULL THEN NULL ELSE "last_event_at" AT TIME ZONE 'UTC' END,
  ALTER COLUMN "join_code" TYPE TEXT;

-- Align notifications column shapes and convert to enum
ALTER TABLE "notifications"
  ALTER COLUMN "id" TYPE TEXT USING "id"::text,
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "type" TYPE "NotificationType" USING "type"::"NotificationType";

-- Ensure users.last_seen uses Prisma precision
ALTER TABLE "users" ALTER COLUMN "last_seen" TYPE TIMESTAMP(3) USING "last_seen";

-- Drop legacy defaults and rename constraint to match Prisma naming
ALTER TABLE "chat_messages" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "game_participants" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "game_snapshots" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "games" ALTER COLUMN "game_type" SET NOT NULL;
ALTER TABLE "game_events" RENAME CONSTRAINT "game_events_user_id_fkey" TO "game_events_player_id_fkey";

-- Recreate foreign keys with Prisma naming conventions
ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "game_participants"
  ADD CONSTRAINT "game_participants_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "game_participants"
  ADD CONSTRAINT "game_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "game_snapshots"
  ADD CONSTRAINT "game_snapshots_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "games"
  ADD CONSTRAINT "games_current_player_id_fkey" FOREIGN KEY ("current_player_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create / rename indexes to match Prisma schema
CREATE UNIQUE INDEX IF NOT EXISTS "game_events_game_id_sequence_number_key" ON "game_events"("game_id", "sequence_number");
ALTER INDEX IF EXISTS "idx_game_events_sequence" RENAME TO "game_events_game_id_sequence_number_idx";
ALTER INDEX IF EXISTS "unique_game_request" RENAME TO "game_events_game_id_request_id_key";
ALTER INDEX IF EXISTS "idx_game_participants_user" RENAME TO "game_participants_user_id_idx";
ALTER INDEX IF EXISTS "idx_game_snapshots_sequence" RENAME TO "game_snapshots_game_id_sequence_number_idx";
ALTER INDEX IF EXISTS "idx_chat_messages_sender_receiver_sent" RENAME TO "chat_messages_sender_id_receiver_id_sent_at_idx";
ALTER INDEX IF EXISTS "idx_chat_messages_receiver_read" RENAME TO "chat_messages_receiver_id_read_at_idx";
ALTER INDEX IF EXISTS "idx_games_status_private" RENAME TO "games_status_is_private_idx";

COMMIT;
