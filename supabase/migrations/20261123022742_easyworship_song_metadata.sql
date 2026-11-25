-- Keep the copyright information supplied by imported song libraries.
ALTER TABLE public.songs
    ADD COLUMN IF NOT EXISTS copyright text,
    ADD COLUMN IF NOT EXISTS ccli_number text;
