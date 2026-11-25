-- Backfill missing collection fields by comparing against the editor's current content.
CREATE OR REPLACE FUNCTION public.refresh_easyworship_design_layout(p_id uuid, p_expected jsonb, p_content jsonb)
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
            AND ((content->'source') - 'collectionDetails' - 'catalogUid')
                = ((p_content->'source') - 'collectionDetails' - 'catalogUid')
            AND (
                content->'source'->>'format' = 'easyworship'
                OR (content->'source'->>'format' = 'powerpoint' AND content - 'source' = p_content - 'source')
            )
        RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM changed);
$$;
