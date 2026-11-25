-- Keep the native source ID independently of the WorshipTeam song UUID.
ALTER TABLE public.songs ADD COLUMN easyworship_uid text
    CHECK (easyworship_uid IS NULL OR easyworship_uid COLLATE "C" ~ '^[a-z0-9][a-z0-9._:-]{0,159}$');
CREATE INDEX songs_easyworship_uid_idx ON public.songs (easyworship_uid) WHERE easyworship_uid IS NOT NULL;

-- Re-import fills missing provenance without replacing the current chart or a recorded source.
CREATE OR REPLACE FUNCTION public.fill_easyworship_song_details(p_details jsonb)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    UPDATE public.songs AS song
    SET copyright_administrator = coalesce(song.copyright_administrator, incoming.copyright_administrator),
        description = coalesce(song.description, incoming.description),
        tags = coalesce(song.tags, incoming.tags),
        easyworship_uid = coalesce(song.easyworship_uid, incoming.easyworship_uid)
    FROM jsonb_to_recordset(p_details) AS incoming(
        id uuid, copyright_administrator text, description text, tags text[], easyworship_uid text
    )
    WHERE song.id = incoming.id
      AND (
          (song.copyright_administrator IS NULL AND incoming.copyright_administrator IS NOT NULL)
          OR (song.description IS NULL AND incoming.description IS NOT NULL)
          OR (song.tags IS NULL AND incoming.tags IS NOT NULL)
          OR (song.easyworship_uid IS NULL AND incoming.easyworship_uid IS NOT NULL)
      );
$$;

-- Carry song provenance through a portable schedule. Earlier packages omit the field.
CREATE OR REPLACE FUNCTION public.import_worshipteam_schedule(
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
        sections, tags, copyright, ccli_number, copyright_administrator, description, appearance, easyworship_uid, user_id
    )
    SELECT id, title, artist, original_key, tempo, time_signature, youtube_url, raw_content,
        sections, tags, copyright, ccli_number, copyright_administrator, description, appearance, easyworship_uid, 'default'
    FROM jsonb_to_recordset(p_songs) AS song(
        id uuid, title text, artist text, original_key text, tempo integer, time_signature text,
        youtube_url text, raw_content text, sections jsonb, tags text[], copyright text,
        ccli_number text, copyright_administrator text, description text, appearance jsonb, easyworship_uid text
    );

    INSERT INTO public.playlist_songs (playlist_id, "order", song_id, cue, transpose, background_asset, slide_theme)
    SELECT p_playlist_id, (entry.position - 1)::integer, (entry.item->>'song_id')::uuid,
        nullif(entry.item->'cue', 'null'::jsonb), coalesce((entry.item->>'transpose')::integer, 0),
        nullif(entry.item->'background_asset', 'null'::jsonb), nullif(entry.item->'slide_theme', 'null'::jsonb)
    FROM jsonb_array_elements(p_entries) WITH ORDINALITY AS entry(item, position);

    RETURN p_playlist_id;
END;
$$;
