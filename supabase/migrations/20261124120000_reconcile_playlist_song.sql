-- Applies one reviewed song decision under the playlist and library row policies.
CREATE FUNCTION public.reconcile_playlist_song(
    p_playlist_id uuid, p_entry_id uuid, p_expected_song_id uuid, p_expected_cue jsonb,
    p_action text, p_target_id uuid, p_target_updated_at timestamptz, p_song jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    entry public.playlist_songs%ROWTYPE;
    target public.songs%ROWTYPE;
    result_cue jsonb;
    next_appearance jsonb;
    same_chart boolean;
BEGIN
    IF p_action IS NULL OR p_action NOT IN ('add', 'replace', 'link', 'use_library') OR p_target_id IS NULL THEN
        RAISE EXCEPTION 'Invalid song decision.' USING ERRCODE = '22023';
    END IF;
    IF p_expected_cue->>'kind' IS DISTINCT FROM 'song' THEN
        RAISE EXCEPTION 'The reviewed item must be a song version.' USING ERRCODE = '22023';
    END IF;
    IF p_action IN ('add', 'replace') AND (jsonb_typeof(p_song) IS DISTINCT FROM 'object'
        OR jsonb_typeof(p_song->'sections') IS DISTINCT FROM 'array'
        OR jsonb_array_length(p_song->'sections') = 0
        OR nullif(btrim(p_song->>'raw_content'), '') IS NULL
        OR (p_action = 'add' AND nullif(btrim(p_song->>'title'), '') IS NULL)) THEN
        RAISE EXCEPTION 'A saved chart must include song sections.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO entry FROM public.playlist_songs
    WHERE playlist_id = p_playlist_id AND id = p_entry_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'The playlist item changed. Review it again.' USING ERRCODE = '40001';
    END IF;

    result_cue := CASE WHEN p_action = 'use_library' THEN NULL ELSE p_expected_cue END;
    IF p_action <> 'replace' AND entry.song_id = p_target_id AND entry.cue IS NOT DISTINCT FROM result_cue THEN
        RETURN p_target_id;
    END IF;
    IF (entry.song_id IS DISTINCT FROM p_expected_song_id
        AND NOT (p_action = 'replace' AND entry.song_id IS NOT DISTINCT FROM p_target_id))
        OR entry.cue IS DISTINCT FROM p_expected_cue THEN
        RAISE EXCEPTION 'The playlist item changed. Review it again.' USING ERRCODE = '40001';
    END IF;

    IF p_action = 'add' THEN
        INSERT INTO public.songs (id, title, artist, original_key, raw_content, sections, appearance,
            copyright, ccli_number, copyright_administrator, description, tags, user_id)
        VALUES (p_target_id, btrim(p_song->>'title'), p_song->>'artist', coalesce(nullif(p_song->>'original_key', ''), 'C'),
            p_song->>'raw_content', p_song->'sections', nullif(p_song->'appearance', 'null'::jsonb),
            p_song->>'copyright', p_song->>'ccli_number', p_song->>'copyright_administrator', p_song->>'description',
            ARRAY(SELECT jsonb_array_elements_text(coalesce(p_song->'tags', '[]'::jsonb))), 'default');
    ELSE
        SELECT * INTO target FROM public.songs WHERE id = p_target_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'The library song changed. Review it again.' USING ERRCODE = '40001';
        END IF;
        IF p_action = 'replace' THEN
            next_appearance := coalesce(nullif(p_song->'appearance', 'null'::jsonb), target.appearance);
            same_chart := target.raw_content IS NOT DISTINCT FROM p_song->>'raw_content'
                AND target.sections IS NOT DISTINCT FROM p_song->'sections'
                AND target.appearance IS NOT DISTINCT FROM next_appearance;
            IF NOT same_chart THEN
                IF target.updated_at IS DISTINCT FROM p_target_updated_at OR entry.song_id IS DISTINCT FROM p_expected_song_id THEN
                    RAISE EXCEPTION 'The library song changed. Review it again.' USING ERRCODE = '40001';
                END IF;
                UPDATE public.songs SET raw_content = p_song->>'raw_content', sections = p_song->'sections',
                    appearance = next_appearance WHERE id = p_target_id;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'The library song cannot be updated.' USING ERRCODE = '42501';
                END IF;
            END IF;
        ELSIF target.updated_at IS DISTINCT FROM p_target_updated_at THEN
            RAISE EXCEPTION 'The library song changed. Review it again.' USING ERRCODE = '40001';
        END IF;
    END IF;

    UPDATE public.playlist_songs SET song_id = p_target_id, cue = result_cue
    WHERE id = p_entry_id AND playlist_id = p_playlist_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'The playlist item cannot be updated.' USING ERRCODE = '42501';
    END IF;
    RETURN p_target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_playlist_song(uuid, uuid, uuid, jsonb, text, uuid, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_playlist_song(uuid, uuid, uuid, jsonb, text, uuid, timestamptz, jsonb) TO anon, authenticated;
