-- Return the result of the same write that claimed the schedule ID.
CREATE FUNCTION public.import_easyworship_schedule_with_status(p_playlist_id uuid, p_name text, p_cues jsonb)
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

    RETURN jsonb_build_object('id', p_playlist_id, 'created', created);
END;
$$;

REVOKE ALL ON FUNCTION public.import_easyworship_schedule_with_status(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_easyworship_schedule_with_status(uuid, text, jsonb) TO anon, authenticated;

-- Keep the UUID response for callers on earlier versions of WorshipTeam.
CREATE OR REPLACE FUNCTION public.import_easyworship_schedule(p_playlist_id uuid, p_name text, p_cues jsonb)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT (public.import_easyworship_schedule_with_status(p_playlist_id, p_name, p_cues)->>'id')::uuid;
$$;
