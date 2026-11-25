-- A linked song can have a schedule-local version while retaining its library link.
ALTER TABLE public.playlist_songs
    DROP CONSTRAINT playlist_entry_has_content,
    ADD CONSTRAINT playlist_entry_has_content CHECK ((
        (song_id IS NOT NULL AND cue IS NULL)
        OR (jsonb_typeof(cue) = 'object'
            AND nullif(btrim(cue->>'label'), '') IS NOT NULL
            AND jsonb_typeof(cue->'slides') = 'array'
            AND cue->>'kind' IN ('song', 'scripture', 'presentation', 'image', 'video', 'audio',
                                 'web', 'camera', 'powerpoint', 'unknown')
            AND (song_id IS NULL OR cue->>'kind' = 'song'))
    ) IS TRUE);

CREATE FUNCTION public.edit_playlist_cue(
    p_playlist_id uuid, p_entry_id uuid, p_expected_cue jsonb, p_cue jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.playlist_songs
    SET cue = p_cue
    WHERE playlist_id = p_playlist_id AND id = p_entry_id
        AND cue IS NOT DISTINCT FROM p_expected_cue;

    IF NOT FOUND AND NOT EXISTS (
        SELECT 1 FROM public.playlist_songs
        WHERE playlist_id = p_playlist_id AND id = p_entry_id
            AND cue IS NOT DISTINCT FROM p_cue
    ) THEN
        RAISE EXCEPTION 'The playlist item changed. Refresh and retry.' USING ERRCODE = '40001';
    END IF;

    RETURN p_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.edit_playlist_cue(uuid, uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_playlist_cue(uuid, uuid, jsonb, jsonb) TO anon, authenticated;
