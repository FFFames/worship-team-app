ALTER TABLE public.songs
    ADD COLUMN copyright_administrator text,
    ADD COLUMN description text;

-- NULL is an unfilled field. Empty text and empty tag lists can be saved to clear a field.
CREATE FUNCTION public.fill_easyworship_song_details(p_details jsonb)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    UPDATE public.songs AS song
    SET copyright_administrator = coalesce(song.copyright_administrator, incoming.copyright_administrator),
        description = coalesce(song.description, incoming.description),
        tags = coalesce(song.tags, incoming.tags)
    FROM jsonb_to_recordset(p_details) AS incoming(id uuid, copyright_administrator text, description text, tags text[])
    WHERE song.id = incoming.id
      AND (
          (song.copyright_administrator IS NULL AND incoming.copyright_administrator IS NOT NULL)
          OR (song.description IS NULL AND incoming.description IS NOT NULL)
          OR (song.tags IS NULL AND incoming.tags IS NOT NULL)
      );
$$;

REVOKE ALL ON FUNCTION public.fill_easyworship_song_details(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fill_easyworship_song_details(jsonb) TO anon, authenticated;
