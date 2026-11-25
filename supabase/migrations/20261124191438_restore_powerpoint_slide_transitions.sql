-- Fill missing PowerPoint transition settings while retaining edited slides and playback.
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
                                    saved.slide - 'design' - 'transition' - 'advanceMs'
                                        = incoming.slide - 'design' - 'transition' - 'advanceMs'
                                    AND (
                                        saved.slide->'transition' IS NOT DISTINCT FROM incoming.slide->'transition'
                                        OR (
                                            saved.slide->'transition' IS NULL AND saved.slide->'transitionEdited' IS NULL
                                            AND jsonb_typeof(incoming.slide->'transition') = 'object'
                                            AND jsonb_typeof(incoming.slide->'transition'->'uid') = 'string'
                                            AND jsonb_typeof(incoming.slide->'transition'->'values') = 'object'
                                        )
                                    )
                                    AND (
                                        saved.slide->'advanceMs' IS NOT DISTINCT FROM incoming.slide->'advanceMs'
                                        OR (
                                            saved.slide->'advanceMs' IS NULL AND saved.slide->'playback' IS NULL
                                            AND jsonb_typeof(incoming.slide->'advanceMs') = 'number'
                                            AND incoming.slide->>'advanceMs' ~ '^[1-9][0-9]{0,9}$'
                                            AND incoming.slide->'advanceMs' <= '2147483647'::jsonb
                                        )
                                    )
                                    AND (
                                        saved.slide->'design' = incoming.slide->'design'
                                        OR (
                                            (saved.slide->'design') - 'layers'
                                                = (incoming.slide->'design') - 'layers' - 'powerPointLayoutBeforeRendering'
                                            AND incoming.slide->'design'->>'powerPointLayoutBeforeRendering' ~ '^[0-9a-f]{64}$'
                                        )
                                        OR (
                                            saved.slide->'design'->'powerPointBuild' IS NULL
                                            AND saved.slide->'design' = (incoming.slide->'design') - 'powerPointBuild'
                                            AND jsonb_typeof(incoming.slide->'design'->'powerPointBuild') = 'array'
                                        )
                                        OR (
                                            (saved.slide->'design') - 'powerPointBuild'
                                                = (incoming.slide->'design') - 'powerPointBuild'
                                            AND saved.slide->'design'->>'powerPointLayoutBeforeMedia' ~ '^[0-9a-f]{64}$'
                                            AND jsonb_typeof(saved.slide->'design'->'powerPointBuild') = 'array'
                                            AND jsonb_typeof(incoming.slide->'design'->'powerPointBuild') = 'array'
                                            AND (
                                                SELECT jsonb_agg(change ORDER BY change)
                                                FROM jsonb_path_query(saved.slide->'design'->'powerPointBuild', '$[*][*]') AS event(change)
                                            ) = (
                                                SELECT jsonb_agg(change ORDER BY change)
                                                FROM jsonb_path_query(incoming.slide->'design'->'powerPointBuild', '$[*][*]') AS event(change)
                                            )
                                        )
                                        OR (
                                            (saved.slide->'design') - 'layers' - 'powerPointBuild' - 'powerPointLayoutBeforeRendering'
                                                - 'soundtracks' - 'powerPointLayoutBeforeMedia' - 'powerPointResolvedMediaLinks'
                                                = (incoming.slide->'design') - 'layers' - 'powerPointBuild' - 'powerPointLayoutBeforeRendering'
                                                    - 'soundtracks' - 'powerPointLayoutBeforeMedia' - 'powerPointResolvedMediaLinks'
                                            AND incoming.slide->'design'->>'powerPointLayoutBeforeMedia' ~ '^[0-9a-f]{64}$'
                                            AND (
                                                (
                                                    saved.slide->'design'->'powerPointLayoutBeforeMedia' IS NULL
                                                    AND saved.slide->'design'->'soundtracks' IS NULL
                                                )
                                                OR (
                                                    saved.slide->'design'->>'powerPointLayoutBeforeMedia'
                                                        = incoming.slide->'design'->>'powerPointLayoutBeforeMedia'
                                                    AND jsonb_typeof(incoming.slide->'design'->'powerPointResolvedMediaLinks') = 'array'
                                                    AND coalesce(saved.slide->'design'->'powerPointResolvedMediaLinks', '[]'::jsonb)
                                                        <@ (incoming.slide->'design'->'powerPointResolvedMediaLinks')
                                                    AND coalesce(saved.slide->'design'->'powerPointResolvedMediaLinks', '[]'::jsonb)
                                                        <> incoming.slide->'design'->'powerPointResolvedMediaLinks'
                                                )
                                            )
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
