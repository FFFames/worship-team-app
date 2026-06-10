-- WorshipTeam App — Initial Schema Migration
-- Run this in the Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Table: songs
-- ============================================================
CREATE TABLE songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  artist text,
  original_key text NOT NULL,
  content_raw text NOT NULL,
  content_parsed jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for search and filtering
CREATE INDEX idx_songs_title ON songs USING btree (title);
CREATE INDEX idx_songs_artist ON songs USING btree (artist);
CREATE INDEX idx_songs_content_parsed ON songs USING gin (content_parsed);
CREATE INDEX idx_songs_created_at ON songs USING btree (created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_songs_updated_at
  BEFORE UPDATE ON songs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Table: playlists
-- ============================================================
CREATE TABLE playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_playlists_created_at ON playlists USING btree (created_at DESC);

CREATE TRIGGER trg_playlists_updated_at
  BEFORE UPDATE ON playlists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Table: playlist_songs (join table with ordering + transpose)
-- ============================================================
CREATE TABLE playlist_songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position integer NOT NULL,
  transpose_semitones integer NOT NULL DEFAULT 0,
  UNIQUE (playlist_id, song_id),
  UNIQUE (playlist_id, position)
);

CREATE INDEX idx_playlist_songs_playlist_position ON playlist_songs USING btree (playlist_id, position);

-- ============================================================
-- Table: video_backgrounds
-- ============================================================
CREATE TABLE video_backgrounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Row Level Security (public policies for MVP)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_backgrounds ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (tighten later for auth)
CREATE POLICY "Public read songs" ON songs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert songs" ON songs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update songs" ON songs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete songs" ON songs FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "Public read playlists" ON playlists FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert playlists" ON playlists FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update playlists" ON playlists FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete playlists" ON playlists FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "Public read playlist_songs" ON playlist_songs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert playlist_songs" ON playlist_songs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update playlist_songs" ON playlist_songs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete playlist_songs" ON playlist_songs FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "Public read video_backgrounds" ON video_backgrounds FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert video_backgrounds" ON video_backgrounds FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update video_backgrounds" ON video_backgrounds FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete video_backgrounds" ON video_backgrounds FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- Seed: Default welcome slide background
-- ============================================================
INSERT INTO video_backgrounds (name, url, is_default) VALUES
  ('Default Welcome', '', true);
