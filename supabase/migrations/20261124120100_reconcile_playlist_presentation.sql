-- Reconcile a schedule snapshot and its library presentation under their existing row policies.
CREATE FUNCTION public.reconcile_playlist_presentation(
    p_playlist_id uuid, p_entry_id uuid, p_expected_cue jsonb, p_action text,
    p_target_id uuid, p_expected_design jsonb, p_content jsonb, p_library_cue jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    entry_cue jsonb;
    next_cue jsonb;
    target public.slide_designs%ROWTYPE;
    is_powerpoint boolean;
BEGIN
    IF p_action IS NULL OR p_action NOT IN ('add', 'replace', 'use_library') OR p_target_id IS NULL
        OR p_expected_cue->>'kind' IS NULL OR p_expected_cue->>'kind' NOT IN ('presentation', 'powerpoint') THEN
        RAISE EXCEPTION 'Invalid presentation decision.' USING ERRCODE = '22023';
    END IF;
    is_powerpoint := p_expected_cue->>'kind' = 'powerpoint';

    IF p_action = 'use_library' THEN
        IF p_library_cue->>'kind' IS DISTINCT FROM p_expected_cue->>'kind' THEN
            RAISE EXCEPTION 'Invalid replacement cue.' USING ERRCODE = '22023';
        END IF;
        next_cue := p_library_cue;
    ELSE
        next_cue := p_expected_cue;
    END IF;
    next_cue := next_cue || jsonb_build_object('libraryDesignId', p_target_id);

    SELECT cue INTO entry_cue FROM public.playlist_songs
    WHERE id = p_entry_id AND playlist_id = p_playlist_id FOR UPDATE;
    IF NOT FOUND OR (entry_cue IS DISTINCT FROM p_expected_cue AND entry_cue IS DISTINCT FROM next_cue) THEN
        RAISE EXCEPTION 'The playlist item changed. Review it again.' USING ERRCODE = '40001';
    END IF;

    IF p_action = 'add' THEN
        IF entry_cue = next_cue AND EXISTS (SELECT 1 FROM public.slide_designs
            WHERE id = p_target_id AND kind = 'presentation' AND content = p_content) THEN
            RETURN p_target_id;
        END IF;
        INSERT INTO public.slide_designs (id, title, kind, content)
        VALUES (p_target_id, p_expected_cue->>'label', 'presentation', p_content);
    ELSE
        SELECT * INTO target FROM public.slide_designs WHERE id = p_target_id AND kind = 'presentation' FOR UPDATE;
        IF NOT FOUND OR coalesce(target.content->'source'->>'format' = 'powerpoint', false) <> is_powerpoint THEN
            RAISE EXCEPTION 'The library presentation changed. Review it again.' USING ERRCODE = '40001';
        END IF;
        IF entry_cue = next_cue AND (p_action = 'use_library' OR target.content = p_content) THEN
            RETURN p_target_id;
        END IF;
        IF entry_cue IS DISTINCT FROM p_expected_cue OR target.title IS DISTINCT FROM p_expected_design->>'title'
            OR target.content IS DISTINCT FROM p_expected_design->'content' THEN
            RAISE EXCEPTION 'The library presentation changed. Review it again.' USING ERRCODE = '40001';
        END IF;
        IF p_action = 'replace' AND target.content IS DISTINCT FROM p_content THEN
            UPDATE public.slide_designs SET content = p_content WHERE id = p_target_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'The library presentation cannot be updated.' USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;

    UPDATE public.playlist_songs SET cue = next_cue WHERE id = p_entry_id AND playlist_id = p_playlist_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'The playlist item cannot be updated.' USING ERRCODE = '42501';
    END IF;
    RETURN p_target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_playlist_presentation(uuid, uuid, jsonb, text, uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_playlist_presentation(uuid, uuid, jsonb, text, uuid, jsonb, jsonb, jsonb) TO anon, authenticated;
