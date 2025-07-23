-- Add game_state column to games table
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "game_state" JSONB;