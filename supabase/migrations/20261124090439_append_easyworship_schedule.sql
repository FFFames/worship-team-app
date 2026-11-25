-- A receipt lets a retried import return the committed batch even after the operator edits or removes its entries.
CREATE TABLE public.easyworship_schedule_appends (
    playlist_id uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
    operation_id uuid NOT NULL,
    source_id uuid NOT NULL,
    entry_count integer NOT NULL CHECK (entry_count BETWEEN 1 AND 10000),
    PRIMARY KEY (playlist_id, operation_id)
);

ALTER TABLE public.easyworship_schedule_appends ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON TABLE public.easyworship_schedule_appends TO anon, authenticated;
CREATE POLICY "Read schedule append receipts" ON public.easyworship_schedule_appends
    FOR SELECT TO anon, authenticated
    USING (EXISTS (SELECT 1 FROM public.playlists WHERE id = playlist_id));
CREATE POLICY "Save schedule append receipts" ON public.easyworship_schedule_appends
    FOR INSERT TO anon, authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.playlists WHERE id = playlist_id));

CREATE FUNCTION public.append_easyworship_schedule(
    p_playlist_id uuid, p_operation_id uuid, p_source_id uuid, p_cues jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    receipt public.easyworship_schedule_appends%ROWTYPE;
    cue_count integer;
    last_position integer;
BEGIN
    IF p_operation_id IS NULL OR p_source_id IS NULL OR jsonb_typeof(p_cues) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'A schedule operation, source and cue array are required' USING ERRCODE = '22023';
    END IF;
    cue_count := jsonb_array_length(p_cues);
    IF cue_count NOT BETWEEN 1 AND 10000 THEN
        RAISE EXCEPTION 'The imported schedule entry count is invalid' USING ERRCODE = '22023';
    END IF;

    -- Serialize with the same playlist row used by append and reorder operations.
    PERFORM 1 FROM public.playlists WHERE id = p_playlist_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'The playlist is inaccessible' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO receipt FROM public.easyworship_schedule_appends
    WHERE playlist_id = p_playlist_id AND operation_id = p_operation_id;
    IF FOUND THEN
        IF receipt.source_id <> p_source_id OR receipt.entry_count <> cue_count THEN
            RAISE EXCEPTION 'The import operation already has another source' USING ERRCODE = '23505';
        END IF;
        RETURN jsonb_build_object('id', p_playlist_id, 'appended', false, 'entries', receipt.entry_count);
    END IF;

    INSERT INTO public.easyworship_schedule_appends (playlist_id, operation_id, source_id, entry_count)
    VALUES (p_playlist_id, p_operation_id, p_source_id, cue_count);
    -- A full library restore retains scoped occurrences even when the destination has no receipt.
    IF EXISTS (
        SELECT 1 FROM public.playlist_songs WHERE playlist_id = p_playlist_id
            AND starts_with(cue->>'sourceId', 'easyworship-append/' || p_operation_id::text || ':')
    ) THEN
        RETURN jsonb_build_object('id', p_playlist_id, 'appended', false, 'entries', cue_count);
    END IF;

    SELECT coalesce(max("order"), -1) INTO last_position
    FROM public.playlist_songs WHERE playlist_id = p_playlist_id;

    INSERT INTO public.playlist_songs (playlist_id, "order", song_id, cue)
    SELECT p_playlist_id, last_position + position::integer, song.id,
        CASE WHEN design.id IS NULL THEN item ELSE item || jsonb_build_object('libraryDesignId', design.id) END
    FROM jsonb_array_elements(p_cues) WITH ORDINALITY AS imported(item, position)
    LEFT JOIN LATERAL (
        SELECT min(song.id::text)::uuid AS id FROM public.songs AS song
        WHERE item->>'kind' = 'song'
            AND song.easyworship_uid = lower(btrim(item #>> '{metadata,presentationUid}', E' \t\n\r\f' || chr(11)) COLLATE "C")
        HAVING count(*) = 1
    ) AS song ON true
    LEFT JOIN LATERAL (
        SELECT min(design.id::text)::uuid AS id FROM public.find_easyworship_library_presentations(
            CASE item->>'kind' WHEN 'presentation' THEN 'easyworship' WHEN 'powerpoint' THEN 'powerpoint' END,
            CASE item->>'kind' WHEN 'presentation' THEN item #>> '{metadata,presentationUid}'
                WHEN 'powerpoint' THEN item #>> '{metadata,powerPointImportKey}' END
        ) AS design
        WHERE item->>'libraryDesignId' IS NULL
        HAVING count(*) = 1
    ) AS design ON true;

    RETURN jsonb_build_object('id', p_playlist_id, 'appended', true, 'entries', cue_count);
END;
$$;

REVOKE ALL ON FUNCTION public.append_easyworship_schedule(uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_easyworship_schedule(uuid, uuid, uuid, jsonb) TO anon, authenticated;
