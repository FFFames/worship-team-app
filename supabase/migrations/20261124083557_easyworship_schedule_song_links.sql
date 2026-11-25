-- A playlist occurrence with its own slides remains playable after deleting the library song.
ALTER TABLE public.playlist_songs
    DROP CONSTRAINT playlist_songs_song_id_fkey,
    ADD CONSTRAINT playlist_songs_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.songs(id) ON DELETE SET NULL;

CREATE INDEX playlist_songs_song_id_idx ON public.playlist_songs (song_id) WHERE song_id IS NOT NULL;

CREATE FUNCTION public.remove_playlist_library_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    -- Occurrences without a snapshot still follow the existing library deletion behavior.
    DELETE FROM public.playlist_songs WHERE song_id = OLD.id AND cue IS NULL;
    RETURN OLD;
END;
$$;

CREATE TRIGGER remove_playlist_library_references
    BEFORE DELETE ON public.songs
    FOR EACH ROW EXECUTE FUNCTION public.remove_playlist_library_references();

REVOKE ALL ON FUNCTION public.remove_playlist_library_references() FROM PUBLIC;

CREATE FUNCTION public.link_easyworship_schedule_songs(p_playlist_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH unlinked AS MATERIALIZED (
        SELECT id, lower(btrim(cue #>> '{metadata,presentationUid}', E' \t\n\r\f' || chr(11)) COLLATE "C") AS uid
        FROM public.playlist_songs
        WHERE playlist_id = p_playlist_id AND song_id IS NULL
            AND cue->>'kind' = 'song' AND cue #>> '{metadata,presentationUid}' IS NOT NULL
            AND EXISTS (SELECT 1 FROM public.playlists WHERE id = p_playlist_id)
    ), candidates AS (
        SELECT song.easyworship_uid AS uid, min(song.id::text)::uuid AS id, count(*) AS versions
        FROM (SELECT DISTINCT uid FROM unlinked) AS source
        JOIN public.songs AS song ON song.easyworship_uid = source.uid
        GROUP BY song.easyworship_uid
    ), linked AS (
        UPDATE public.playlist_songs AS entry
        SET song_id = candidate.id
        FROM unlinked JOIN candidates AS candidate USING (uid)
        WHERE candidate.versions = 1 AND entry.id = unlinked.id
            AND entry.playlist_id = p_playlist_id AND entry.song_id IS NULL
            AND entry.cue->>'kind' = 'song'
            AND lower(btrim(entry.cue #>> '{metadata,presentationUid}', E' \t\n\r\f' || chr(11)) COLLATE "C") = unlinked.uid
        RETURNING entry.id
    )
    SELECT jsonb_build_object(
        'linked_songs', (SELECT count(*) FROM linked),
        'ambiguous_songs', (SELECT count(*) FROM unlinked JOIN candidates USING (uid) WHERE versions > 1)
    );
$$;

REVOKE ALL ON FUNCTION public.link_easyworship_schedule_songs(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_easyworship_schedule_songs(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.import_easyworship_schedule_with_status(p_playlist_id uuid, p_name text, p_cues jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    created boolean;
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
    created := FOUND;

    IF created THEN
        INSERT INTO public.playlist_songs (playlist_id, "order", cue)
        SELECT p_playlist_id, (position - 1)::integer, item
        FROM jsonb_array_elements(p_cues) WITH ORDINALITY AS cues(item, position);
    ELSIF NOT EXISTS (SELECT 1 FROM public.playlists WHERE id = p_playlist_id) THEN
        RAISE EXCEPTION 'The schedule is inaccessible' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object('id', p_playlist_id, 'created', created)
        || public.link_easyworship_schedule_songs(p_playlist_id);
END;
$$;
