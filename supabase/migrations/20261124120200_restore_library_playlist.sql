-- Restore each schedule with its original identifiers and all occurrences in one transaction.
CREATE FUNCTION public.restore_library_playlist(p_playlist jsonb, p_entries jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    playlist_id uuid := (p_playlist->>'id')::uuid;
BEGIN
    IF playlist_id IS NULL OR jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'A playlist and occurrence array are required.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.playlists (id, name, date, notes, user_id, created_at, updated_at)
    VALUES (playlist_id, p_playlist->>'name', p_playlist->>'date', p_playlist->>'notes', 'default',
        (p_playlist->>'created_at')::timestamptz, (p_playlist->>'updated_at')::timestamptz)
    ON CONFLICT (id) DO NOTHING;

    IF NOT FOUND THEN
        IF NOT EXISTS (SELECT 1 FROM public.playlists WHERE id = playlist_id) THEN
            RAISE EXCEPTION 'The playlist is inaccessible.' USING ERRCODE = '42501';
        END IF;
        RETURN false;
    END IF;

    INSERT INTO public.playlist_songs (id, playlist_id, song_id, transpose, "order", created_at, cue, background_asset, slide_theme)
    SELECT entry.id, playlist_id, entry.song_id, entry.transpose, entry."order", entry.created_at,
        entry.cue, entry.background_asset, entry.slide_theme
    FROM jsonb_to_recordset(p_entries) AS entry(id uuid, song_id uuid, transpose integer, "order" integer,
        created_at timestamptz, cue jsonb, background_asset jsonb, slide_theme jsonb);

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_library_playlist(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_library_playlist(jsonb, jsonb) TO anon, authenticated;
