-- Optional native song layouts. Songs without them keep the existing display behaviour.
ALTER TABLE public.songs
    ADD COLUMN appearance jsonb,
    ADD CONSTRAINT song_appearance_object CHECK (
        appearance IS NULL OR (
            jsonb_typeof(appearance) = 'object'
            AND (NOT (appearance ? 'defaultDesign') OR jsonb_typeof(appearance->'defaultDesign') = 'object')
            AND (NOT (appearance ? 'sections') OR jsonb_typeof(appearance->'sections') = 'array')
            AND (NOT (appearance ? 'warnings') OR jsonb_typeof(appearance->'warnings') = 'array')
        ) IS TRUE
    );

-- Backfill earlier imports. Existing layout data must also be present in the new
-- record, so an import with more resources can supply missing asset references.
CREATE FUNCTION public.fill_easyworship_song_appearances(p_appearances jsonb)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    UPDATE public.songs AS song
    SET appearance = incoming.appearance
    FROM jsonb_to_recordset(p_appearances) AS incoming(id uuid, appearance jsonb)
    WHERE song.id = incoming.id AND incoming.appearance IS NOT NULL
      AND (
          song.appearance IS NULL OR (
              (incoming.appearance - 'warnings') @> (song.appearance - 'warnings')
              AND (incoming.appearance - 'warnings') <> (song.appearance - 'warnings')
          )
      );
$$;

REVOKE ALL ON FUNCTION public.fill_easyworship_song_appearances(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fill_easyworship_song_appearances(jsonb) TO anon, authenticated;
