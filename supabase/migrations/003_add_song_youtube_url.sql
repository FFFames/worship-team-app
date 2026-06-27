-- Add an optional YouTube reference video to each song.
ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS youtube_url text;
