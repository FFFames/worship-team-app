CREATE FUNCTION public.update_playlist_media(p_playlist_id uuid, p_updates jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    patch record;
    patch_count integer;
BEGIN
    IF jsonb_typeof(p_updates) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Expected an array of playlist media updates.' USING ERRCODE = '22023';
    END IF;

    patch_count := jsonb_array_length(p_updates);
    IF patch_count = 0 OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_updates) AS items(value)
        WHERE jsonb_typeof(value) IS DISTINCT FROM 'object'
           OR NOT value ?& ARRAY['entry_id', 'expected_cue', 'cue', 'expected_background', 'background', 'expected_theme', 'theme']
    ) OR patch_count <> (
        SELECT count(DISTINCT entry_id)
        FROM jsonb_to_recordset(p_updates) AS entries(entry_id uuid)
    ) THEN
        RAISE EXCEPTION 'Expected distinct playlist media updates for one playlist.' USING ERRCODE = '22023';
    END IF;

    -- Keep the batch atomic and acquire row locks in the same order on concurrent calls.
    FOR patch IN
        SELECT * FROM jsonb_to_recordset(p_updates) AS entries(
            entry_id uuid, expected_cue jsonb, cue jsonb, expected_background jsonb, background jsonb,
            expected_theme jsonb, theme jsonb
        )
        ORDER BY entry_id
    LOOP
        UPDATE public.playlist_songs
        SET cue = patch.cue, background_asset = patch.background, slide_theme = patch.theme
        WHERE playlist_id = p_playlist_id AND id = patch.entry_id
            AND cue IS NOT DISTINCT FROM patch.expected_cue
            AND background_asset IS NOT DISTINCT FROM patch.expected_background
            AND slide_theme IS NOT DISTINCT FROM patch.expected_theme;

        -- An identical retry can succeed when the original response was lost.
        IF NOT FOUND AND NOT EXISTS (
            SELECT 1 FROM public.playlist_songs
            WHERE playlist_id = p_playlist_id AND id = patch.entry_id
                AND cue IS NOT DISTINCT FROM patch.cue
                AND background_asset IS NOT DISTINCT FROM patch.background
                AND slide_theme IS NOT DISTINCT FROM patch.theme
        ) THEN
            RAISE EXCEPTION 'The playlist changed. Review the media updates again.' USING ERRCODE = '40001';
        END IF;
    END LOOP;

    RETURN patch_count;
END;
$$;

REVOKE ALL ON FUNCTION public.update_playlist_media(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_playlist_media(uuid, jsonb) TO anon, authenticated;
