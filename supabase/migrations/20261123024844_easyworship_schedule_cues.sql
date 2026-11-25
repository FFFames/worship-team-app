-- Keep existing playlist and song IDs. One song can appear in several cues.
ALTER TABLE public.playlist_songs
    DROP CONSTRAINT IF EXISTS playlist_songs_playlist_id_song_id_key,
    ALTER COLUMN song_id DROP NOT NULL,
    ADD COLUMN cue jsonb,
    ADD CONSTRAINT playlist_entry_has_content CHECK ((
        (song_id IS NOT NULL AND cue IS NULL)
        OR (song_id IS NULL AND jsonb_typeof(cue) = 'object'
            AND nullif(btrim(cue->>'label'), '') IS NOT NULL
            AND jsonb_typeof(cue->'slides') = 'array'
            AND cue->>'kind' IN ('song', 'scripture', 'presentation', 'image', 'video', 'audio', 'web', 'powerpoint', 'unknown'))
    ) IS TRUE);

-- Insert the playlist and every occurrence in the same transaction.
CREATE FUNCTION public.import_easyworship_schedule(p_playlist_id uuid, p_name text, p_cues jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF nullif(btrim(p_name), '') IS NULL OR jsonb_typeof(p_cues) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'A schedule name and cue array are required' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_cues) = 0 THEN
        RAISE EXCEPTION 'The schedule has no cues' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.playlists (id, name, user_id)
    VALUES (p_playlist_id, btrim(p_name), 'default')
    ON CONFLICT (id) DO NOTHING;

    IF FOUND THEN
        INSERT INTO public.playlist_songs (playlist_id, "order", cue)
        SELECT p_playlist_id, (position - 1)::integer, item
        FROM jsonb_array_elements(p_cues) WITH ORDINALITY AS cues(item, position);
    ELSIF NOT EXISTS (SELECT 1 FROM public.playlists WHERE id = p_playlist_id) THEN
        RAISE EXCEPTION 'The schedule is inaccessible' USING ERRCODE = '42501';
    END IF;

    RETURN p_playlist_id;
END;
$$;

CREATE FUNCTION public.append_playlist_song(p_playlist_id uuid, p_song_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    PERFORM 1 FROM public.playlists WHERE id = p_playlist_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'The playlist is inaccessible' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.playlist_songs (playlist_id, song_id, "order")
    SELECT p_playlist_id, p_song_id, coalesce(max("order") + 1, 0)
    FROM public.playlist_songs WHERE playlist_id = p_playlist_id;
END;
$$;

CREATE FUNCTION public.reorder_playlist_entries(p_playlist_id uuid, p_entry_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    entry_count integer;
    updated_count integer;
BEGIN
    PERFORM 1 FROM public.playlists WHERE id = p_playlist_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'The playlist is inaccessible' USING ERRCODE = '42501';
    END IF;

    SELECT count(*) INTO entry_count FROM public.playlist_songs WHERE playlist_id = p_playlist_id;
    IF cardinality(p_entry_ids) IS DISTINCT FROM entry_count
        OR (SELECT count(DISTINCT id) FROM unnest(p_entry_ids) AS items(id)) <> entry_count THEN
        RAISE EXCEPTION 'The playlist changed. Refresh and retry.' USING ERRCODE = '40001';
    END IF;

    UPDATE public.playlist_songs AS entry
    SET "order" = (items.position - 1)::integer
    FROM unnest(p_entry_ids) WITH ORDINALITY AS items(id, position)
    WHERE entry.playlist_id = p_playlist_id AND entry.id = items.id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    IF updated_count <> entry_count THEN
        RAISE EXCEPTION 'The playlist changed. Refresh and retry.' USING ERRCODE = '40001';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.import_easyworship_schedule(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_playlist_song(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reorder_playlist_entries(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_easyworship_schedule(uuid, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_playlist_song(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_playlist_entries(uuid, uuid[]) TO anon, authenticated;
