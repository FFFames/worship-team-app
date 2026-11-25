-- Allow matching PowerPoint slides to gain their click builds without rewriting their visual layers.
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
                OR (content->'source'->>'format' = 'powerpoint' AND (
                    content - 'source' = p_content - 'source'
                    OR (
                        content - 'source' - 'warnings' - 'slides' = p_content - 'source' - 'warnings' - 'slides'
                        AND jsonb_array_length(content->'slides') = jsonb_array_length(p_content->'slides')
                        AND NOT EXISTS (
                            SELECT 1
                            FROM jsonb_array_elements(content->'slides') WITH ORDINALITY AS saved(slide, position)
                            JOIN jsonb_array_elements(p_content->'slides') WITH ORDINALITY AS incoming(slide, position) USING (position)
                            WHERE saved.slide <> incoming.slide
                                AND NOT ((
                                    saved.slide - 'design' = incoming.slide - 'design'
                                    AND (
                                        (
                                            (saved.slide->'design') - 'layers'
                                                = (incoming.slide->'design') - 'layers' - 'powerPointLayoutBeforeRendering'
                                            AND incoming.slide->'design'->>'powerPointLayoutBeforeRendering' ~ '^[0-9a-f]{64}$'
                                        )
                                        OR (
                                            saved.slide->'design'->'powerPointBuild' IS NULL
                                            AND saved.slide->'design' = (incoming.slide->'design') - 'powerPointBuild'
                                            AND jsonb_typeof(incoming.slide->'design'->'powerPointBuild') = 'array'
                                        )
                                    )
                                ) IS TRUE)
                        )
                    )
                ))
            )
        RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM changed);
$$;
