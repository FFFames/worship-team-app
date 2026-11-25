-- Refresh imported formatting only while the shared design still matches the caller's snapshot.
CREATE FUNCTION public.refresh_easyworship_design_layout(p_id uuid, p_expected jsonb, p_content jsonb)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH changed AS (
        UPDATE public.slide_designs
        SET content = p_content
        WHERE id = p_id
            AND content = p_expected
            AND content->'source'->>'format' = 'easyworship'
            AND content->'source' = p_content->'source'
        RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM changed);
$$;

REVOKE ALL ON FUNCTION public.refresh_easyworship_design_layout(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_easyworship_design_layout(uuid, jsonb, jsonb) TO anon, authenticated;
