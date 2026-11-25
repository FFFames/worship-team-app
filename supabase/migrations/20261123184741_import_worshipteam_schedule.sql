-- Restore an independent copy of a portable playlist and its linked song snapshots.
CREATE FUNCTION public.import_worshipteam_schedule(
    p_playlist_id uuid,
    p_name text,
    p_date text,
    p_notes text,
    p_songs jsonb,
    p_entries jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF nullif(btrim(p_name), '') IS NULL
        OR jsonb_typeof(p_songs) IS DISTINCT FROM 'array'
        OR jsonb_typeof(p_entries) IS DISTINCT FROM 'array'
    THEN
        RAISE EXCEPTION 'A playlist name and record arrays are required' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.playlists (id, name, date, notes, user_id)
    VALUES (p_playlist_id, btrim(p_name), p_date, p_notes, 'default')
    ON CONFLICT (id) DO NOTHING;

    IF NOT FOUND THEN
        IF NOT EXISTS (SELECT 1 FROM public.playlists WHERE id = p_playlist_id) THEN
            RAISE EXCEPTION 'The playlist is inaccessible' USING ERRCODE = '42501';
        END IF;
        RETURN p_playlist_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_entries) AS entry(song_id uuid)
        WHERE entry.song_id IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM jsonb_to_recordset(p_songs) AS snapshot(id uuid)
                WHERE snapshot.id = entry.song_id
            )
    ) THEN
        RAISE EXCEPTION 'A referenced song is absent from the package' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.songs (
        id, title, artist, original_key, tempo, time_signature, youtube_url, raw_content,
        sections, tags, copyright, ccli_number, appearance, user_id
    )
    SELECT id, title, artist, original_key, tempo, time_signature, youtube_url, raw_content,
        sections, tags, copyright, ccli_number, appearance, 'default'
    FROM jsonb_to_recordset(p_songs) AS song(
        id uuid, title text, artist text, original_key text, tempo integer, time_signature text,
        youtube_url text, raw_content text, sections jsonb, tags text[], copyright text,
        ccli_number text, appearance jsonb
    );

    INSERT INTO public.playlist_songs (playlist_id, "order", song_id, cue, transpose, background_asset, slide_theme)
    SELECT p_playlist_id, (entry.position - 1)::integer, (entry.item->>'song_id')::uuid,
        nullif(entry.item->'cue', 'null'::jsonb), coalesce((entry.item->>'transpose')::integer, 0),
        nullif(entry.item->'background_asset', 'null'::jsonb), nullif(entry.item->'slide_theme', 'null'::jsonb)
    FROM jsonb_array_elements(p_entries) WITH ORDINALITY AS entry(item, position);

    RETURN p_playlist_id;
END;
$$;

REVOKE ALL ON FUNCTION public.import_worshipteam_schedule(uuid, text, text, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_worshipteam_schedule(uuid, text, text, text, jsonb, jsonb) TO anon, authenticated;
