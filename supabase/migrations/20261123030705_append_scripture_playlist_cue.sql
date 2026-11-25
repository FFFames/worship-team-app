-- Append a cue with the same playlist lock used by song insertion and ordering.
CREATE FUNCTION public.append_playlist_cue(p_playlist_id uuid, p_entry_id uuid, p_cue jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    PERFORM 1 FROM public.playlists WHERE id = p_playlist_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'The playlist is inaccessible' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.playlist_songs (id, playlist_id, "order", cue)
    SELECT p_entry_id, p_playlist_id, coalesce(max("order") + 1, 0), p_cue
    FROM public.playlist_songs WHERE playlist_id = p_playlist_id
    ON CONFLICT (id) DO NOTHING;

    IF NOT FOUND AND NOT EXISTS (
        SELECT 1 FROM public.playlist_songs
        WHERE id = p_entry_id AND playlist_id = p_playlist_id AND cue = p_cue
    ) THEN
        RAISE EXCEPTION 'The playlist entry ID is already in use' USING ERRCODE = '23505';
    END IF;

    RETURN p_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.append_playlist_cue(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_playlist_cue(uuid, uuid, jsonb) TO anon, authenticated;
