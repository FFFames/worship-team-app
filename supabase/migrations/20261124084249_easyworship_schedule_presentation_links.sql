-- Match reusable presentation designs by their original ID independently of title changes.
CREATE INDEX slide_designs_presentation_source_idx ON public.slide_designs (
    (content #>> '{source,format}'),
    (lower(btrim(content #>> '{source,uid}') COLLATE "C"))
) WHERE kind = 'presentation';

CREATE FUNCTION public.find_easyworship_library_presentations(p_format text, p_uid text)
RETURNS SETOF public.slide_designs
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT design.* FROM public.slide_designs AS design
    WHERE design.kind = 'presentation' AND p_format IN ('easyworship', 'powerpoint')
        AND design.content #>> '{source,format}' = p_format
        AND lower(btrim(design.content #>> '{source,uid}') COLLATE "C") = lower(btrim(p_uid) COLLATE "C")
        AND nullif(btrim(p_uid), '') IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.find_easyworship_library_presentations(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_easyworship_library_presentations(text, text) TO anon, authenticated;

CREATE FUNCTION public.link_easyworship_schedule_presentations(
    p_playlist_id uuid, p_cues jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH original_decks AS (
        -- Earlier completed imports did not store the PowerPoint file fingerprint.
        SELECT item->>'sourceId' AS source_id, item->'slides' AS slides,
            min(item #>> '{metadata,powerPointImportKey}') AS fingerprint
        FROM jsonb_array_elements(p_cues) AS source(item)
        WHERE item->>'kind' = 'powerpoint'
            AND nullif(item #>> '{metadata,powerPointImportKey}', '') IS NOT NULL
        GROUP BY source_id, slides
        HAVING count(DISTINCT item #>> '{metadata,powerPointImportKey}') = 1
    ), unlinked AS MATERIALIZED (
        SELECT entry.id, entry.cue,
            CASE entry.cue->>'kind' WHEN 'powerpoint' THEN 'powerpoint' ELSE 'easyworship' END AS format,
            CASE entry.cue->>'kind'
                WHEN 'powerpoint' THEN coalesce(nullif(entry.cue #>> '{metadata,powerPointImportKey}', ''), deck.fingerprint)
                ELSE entry.cue #>> '{metadata,presentationUid}'
            END AS uid,
            CASE WHEN nullif(entry.cue #>> '{metadata,powerPointImportKey}', '') IS NULL
                THEN deck.fingerprint END AS recovered_fingerprint
        FROM public.playlist_songs AS entry
        LEFT JOIN original_decks AS deck ON entry.cue->>'kind' = 'powerpoint'
            AND entry.cue->>'sourceId' = deck.source_id AND entry.cue->'slides' = deck.slides
        WHERE entry.playlist_id = p_playlist_id AND entry.cue->>'kind' IN ('presentation', 'powerpoint')
            AND entry.cue->>'libraryDesignId' IS NULL
            AND EXISTS (SELECT 1 FROM public.playlists WHERE id = p_playlist_id)
    ), candidates AS (
        SELECT source.format, source.uid, min(design.id::text)::uuid AS id, count(*) AS versions
        FROM (SELECT DISTINCT format, lower(btrim(uid) COLLATE "C") AS uid FROM unlinked WHERE nullif(btrim(uid), '') IS NOT NULL) AS source
        JOIN public.slide_designs AS design ON design.kind = 'presentation'
            AND design.content #>> '{source,format}' = source.format
            AND lower(btrim(design.content #>> '{source,uid}') COLLATE "C") = source.uid
        GROUP BY source.format, source.uid
    ), links AS (
        SELECT unlinked.*, candidates.id AS design_id, candidates.versions
        FROM unlinked
        LEFT JOIN candidates ON candidates.format = unlinked.format
            AND candidates.uid = lower(btrim(unlinked.uid) COLLATE "C")
    ), updated AS (
        UPDATE public.playlist_songs AS entry
        SET cue = entry.cue
            || CASE WHEN links.recovered_fingerprint IS NOT NULL THEN jsonb_build_object('metadata',
                (CASE WHEN jsonb_typeof(entry.cue->'metadata') = 'object' THEN entry.cue->'metadata' ELSE '{}'::jsonb END)
                    || jsonb_build_object('powerPointImportKey', links.recovered_fingerprint))
                ELSE '{}'::jsonb END
            || CASE WHEN links.versions = 1 THEN jsonb_build_object('libraryDesignId', links.design_id)
                ELSE '{}'::jsonb END
        FROM links
        WHERE entry.id = links.id AND entry.playlist_id = p_playlist_id AND entry.cue = links.cue
            AND (links.versions = 1 OR links.recovered_fingerprint IS NOT NULL)
        RETURNING links.versions
    )
    SELECT jsonb_build_object(
        'linked_presentations', (SELECT count(*) FROM updated WHERE versions = 1),
        'ambiguous_presentations', (SELECT count(*) FROM links WHERE versions > 1)
    );
$$;

REVOKE ALL ON FUNCTION public.link_easyworship_schedule_presentations(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_easyworship_schedule_presentations(uuid, jsonb) TO anon, authenticated;

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
        || public.link_easyworship_schedule_songs(p_playlist_id)
        || public.link_easyworship_schedule_presentations(p_playlist_id, p_cues);
END;
$$;
