-- ============================================================
-- WorshipTeam — Corrected Schema Migration (matches TypeScript code)
-- ============================================================
-- This migration DROPS the old tables from 001_initial.sql and
-- recreates them with column names/types that exactly match what
-- the frontend TypeScript code sends and expects.
--
-- MISMATCHES FIXED vs 001_initial.sql:
--   songs:
--     - content_raw  → raw_content  (column rename)
--     - content_parsed → sections   (column rename + type change to nullable jsonb)
--     - created_by uuid FK → user_id text  (column rename + type change)
--     + tempo integer nullable              (new column)
--     + time_signature text nullable        (new column)
--     + tags text[] nullable                 (new column)
--     + favorite boolean nullable            (new column)
--   playlists:
--     - description → notes   (column rename)
--     - created_by uuid FK → user_id text   (column rename + type change)
--     + date text nullable                   (new column)
--   playlist_songs:
--     - position → order       (column rename, "order" is a reserved word, must quote)
--     - transpose_semitones → transpose  (column rename)
--     + created_at timestamptz              (new column)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Drop old tables (run only on a fresh DB or after data migration)
-- ============================================================
DROP TABLE IF EXISTS playlist_songs CASCADE;
DROP TABLE IF EXISTS playlists CASCADE;
DROP TABLE IF EXISTS songs CASCADE;
DROP TABLE IF EXISTS video_backgrounds CASCADE;

-- ============================================================
-- Table: songs
-- ============================================================
CREATE TABLE songs (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    title         text        NOT NULL,
    artist        text,
    original_key  text        NOT NULL DEFAULT 'C',
    tempo         integer,
    time_signature text,
    youtube_url   text,
    raw_content   text        NOT NULL DEFAULT '',
    sections      jsonb,                          -- nullable; DbSongSection[] JSONB
    user_id       text,                           -- nullable; hardcoded 'default' in code
    tags          text[],                         -- nullable; string array
    favorite      boolean,                        -- nullable
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_songs_title       ON songs USING btree (title);
CREATE INDEX idx_songs_artist      ON songs USING btree (artist);
CREATE INDEX idx_songs_updated_at  ON songs USING btree (updated_at DESC);
CREATE INDEX idx_songs_sections    ON songs USING gin (sections);

-- ============================================================
-- Table: playlists
-- ============================================================
CREATE TABLE playlists (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text        NOT NULL,
    date        text,                           -- nullable; ISO date string e.g. '2026-06-11'
    notes       text,                           -- nullable; replaces old 'description'
    user_id     text,                           -- nullable; hardcoded 'default' in code
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_playlists_created_at ON playlists USING btree (created_at DESC);

-- ============================================================
-- Table: playlist_songs (join table with ordering + transpose)
-- ============================================================
CREATE TABLE playlist_songs (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id  uuid        NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    song_id      uuid        NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    transpose    integer     NOT NULL DEFAULT 0,               -- semitone offset
    "order"      integer     NOT NULL DEFAULT 0,               -- MUST quote — reserved word
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (playlist_id, song_id)
);

CREATE INDEX idx_playlist_songs_playlist_order ON playlist_songs USING btree (playlist_id, "order");

-- ============================================================
-- Table: video_backgrounds
-- ============================================================
CREATE TABLE video_backgrounds (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text        NOT NULL,
    url         text        NOT NULL,
    is_default  boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Auto-update updated_at trigger
-- ============================================================
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

CREATE TRIGGER trg_playlists_updated_at
    BEFORE UPDATE ON playlists
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Row Level Security (public policies for MVP — same as before)
-- ============================================================
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_backgrounds ENABLE ROW LEVEL SECURITY;

-- Songs
CREATE POLICY "Public read songs"  ON songs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert songs" ON songs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update songs" ON songs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete songs" ON songs FOR DELETE TO anon, authenticated USING (true);

-- Playlists
CREATE POLICY "Public read playlists"  ON playlists FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert playlists" ON playlists FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update playlists" ON playlists FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete playlists" ON playlists FOR DELETE TO anon, authenticated USING (true);

-- Playlist Songs
CREATE POLICY "Public read playlist_songs"  ON playlist_songs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert playlist_songs" ON playlist_songs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update playlist_songs" ON playlist_songs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete playlist_songs" ON playlist_songs FOR DELETE TO anon, authenticated USING (true);

-- Video Backgrounds
CREATE POLICY "Public read video_backgrounds"  ON video_backgrounds FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert video_backgrounds" ON video_backgrounds FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update video_backgrounds" ON video_backgrounds FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete video_backgrounds" ON video_backgrounds FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- Seed: Default welcome slide background
-- ============================================================
INSERT INTO video_backgrounds (name, url, is_default) VALUES
    ('Default Welcome', '', true);
