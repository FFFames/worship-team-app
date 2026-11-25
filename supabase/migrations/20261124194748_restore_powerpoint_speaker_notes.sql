-- Fill missing speaker notes on a matching PowerPoint slide and preserve saved edits and clearings.
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
                            CROSS JOIN LATERAL (
                                SELECT saved.slide->'design' AS prior, incoming.slide->'design' AS next
                            ) AS design
                            CROSS JOIN LATERAL (
                                SELECT jsonb_path_query_array(design.prior, '$.soundtracks[*] ? (@.powerPointTransitionSound == true)') AS prior,
                                    jsonb_path_query_array(design.next, '$.soundtracks[*] ? (@.powerPointTransitionSound == true)') AS next
                            ) AS sound
                            CROSS JOIN LATERAL (
                                SELECT jsonb_path_query_array(design.prior, '$.soundtracks[*] ? (!exists(@.powerPointTransitionSound) || @.powerPointTransitionSound != true)') AS prior,
                                    jsonb_path_query_array(design.next, '$.soundtracks[*] ? (!exists(@.powerPointTransitionSound) || @.powerPointTransitionSound != true)') AS next
                            ) AS other_tracks
                            CROSS JOIN LATERAL (
                                SELECT
                                    CASE WHEN sound.prior <> '[]'::jsonb
                                            OR (sound.next <> '[]'::jsonb AND design.prior->'soundtracks' = '[]'::jsonb)
                                        THEN design.prior - 'powerPointStopTransitionSound' - 'soundtracks'
                                            || CASE WHEN other_tracks.prior = '[]'::jsonb THEN '{}'::jsonb
                                                ELSE jsonb_build_object('soundtracks', other_tracks.prior) END
                                        ELSE design.prior - 'powerPointStopTransitionSound'
                                    END AS prior,
                                    CASE WHEN sound.next <> '[]'::jsonb
                                        THEN design.next - 'powerPointStopTransitionSound' - 'soundtracks'
                                            || CASE WHEN other_tracks.next = '[]'::jsonb THEN '{}'::jsonb
                                                ELSE jsonb_build_object('soundtracks', other_tracks.next) END
                                        ELSE design.next - 'powerPointStopTransitionSound'
                                    END AS next
                            ) AS layout
                            CROSS JOIN LATERAL (
                                SELECT (layout.prior->'powerPointTablesImported' IS NULL
                                    AND layout.next->'powerPointTablesImported' = 'true'::jsonb
                                    AND layout.prior->'powerPointLayoutBeforeRendering' IS NULL) IS TRUE AS restoring
                            ) AS tables
                            CROSS JOIN LATERAL (
                                SELECT layout.prior,
                                    CASE WHEN tables.restoring
                                        THEN (layout.next - 'powerPointTablesImported' - 'layers')
                                            || jsonb_build_object('layers', jsonb_path_query_array(layout.next,
                                                '$.layers[*] ? (!(@.id like_regex ":table:[0-9]+:[0-9]+:(fill|text|left|right|top|bottom|image)$"))'))
                                        ELSE layout.next
                                    END AS next
                            ) AS visual
                            WHERE saved.slide <> incoming.slide
                                AND NOT ((
                                    saved.slide - 'design' - 'transition' - 'advanceMs' - 'speakerNotes'
                                        = incoming.slide - 'design' - 'transition' - 'advanceMs' - 'speakerNotes'
                                    AND (
                                        saved.slide->'speakerNotes' IS NOT DISTINCT FROM incoming.slide->'speakerNotes'
                                        OR (
                                            saved.slide->'speakerNotes' IS NULL
                                            AND jsonb_typeof(incoming.slide->'speakerNotes') = 'string'
                                            AND char_length(incoming.slide->>'speakerNotes') <= 50000
                                            AND btrim(incoming.slide->>'speakerNotes') <> ''
                                        )
                                    )
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
                                        (design.prior->'powerPointStopTransitionSound' IS NOT DISTINCT FROM design.next->'powerPointStopTransitionSound'
                                            AND sound.prior = sound.next)
                                        OR (
                                            design.prior->'powerPointStopTransitionSound' IS NULL AND sound.prior = '[]'::jsonb
                                            AND (
                                                (design.next->'powerPointStopTransitionSound' = 'true'::jsonb AND sound.next = '[]'::jsonb)
                                                OR (
                                                    design.next->'powerPointStopTransitionSound' IS NULL
                                                    AND jsonb_array_length(sound.next) = 1 AND sound.next->0->>'kind' = 'audio'
                                                    AND jsonb_typeof(sound.next->0->'libraryId') = 'string'
                                                )
                                            )
                                        )
                                    )
                                    AND (
                                        layout.prior->'powerPointTablesImported' IS NOT DISTINCT FROM layout.next->'powerPointTablesImported'
                                        OR (
                                            tables.restoring
                                            AND jsonb_typeof(layout.next->'layers') = 'array'
                                            AND jsonb_array_length(layout.next->'layers') > jsonb_array_length(visual.next->'layers')
                                        )
                                    )
                                    AND (
                                        visual.prior = visual.next
                                        OR (
                                            (visual.prior) - 'layers'
                                                = (visual.next) - 'layers' - 'powerPointLayoutBeforeRendering'
                                            AND visual.next->>'powerPointLayoutBeforeRendering' ~ '^[0-9a-f]{64}$'
                                        )
                                        OR (
                                            visual.prior->'powerPointBuild' IS NULL
                                            AND visual.prior = (visual.next) - 'powerPointBuild'
                                            AND jsonb_typeof(visual.next->'powerPointBuild') = 'array'
                                        )
                                        OR (
                                            (visual.prior) - 'powerPointBuild'
                                                = (visual.next) - 'powerPointBuild'
                                            AND visual.prior->>'powerPointLayoutBeforeMedia' ~ '^[0-9a-f]{64}$'
                                            AND jsonb_typeof(visual.prior->'powerPointBuild') = 'array'
                                            AND jsonb_typeof(visual.next->'powerPointBuild') = 'array'
                                            AND (
                                                SELECT jsonb_agg(change ORDER BY change)
                                                FROM jsonb_path_query(visual.prior->'powerPointBuild', '$[*][*]') AS event(change)
                                            ) = (
                                                SELECT jsonb_agg(change ORDER BY change)
                                                FROM jsonb_path_query(visual.next->'powerPointBuild', '$[*][*]') AS event(change)
                                            )
                                        )
                                        OR (
                                            (visual.prior) - 'layers' - 'powerPointBuild' - 'powerPointLayoutBeforeRendering'
                                                - 'soundtracks' - 'powerPointLayoutBeforeMedia' - 'powerPointResolvedMediaLinks'
                                                = (visual.next) - 'layers' - 'powerPointBuild' - 'powerPointLayoutBeforeRendering'
                                                    - 'soundtracks' - 'powerPointLayoutBeforeMedia' - 'powerPointResolvedMediaLinks'
                                            AND visual.next->>'powerPointLayoutBeforeMedia' ~ '^[0-9a-f]{64}$'
                                            AND (
                                                (
                                                    visual.prior->'powerPointLayoutBeforeMedia' IS NULL
                                                    AND visual.prior->'soundtracks' IS NULL
                                                )
                                                OR (
                                                    visual.prior->>'powerPointLayoutBeforeMedia'
                                                        = visual.next->>'powerPointLayoutBeforeMedia'
                                                    AND jsonb_typeof(visual.next->'powerPointResolvedMediaLinks') = 'array'
                                                    AND coalesce(visual.prior->'powerPointResolvedMediaLinks', '[]'::jsonb)
                                                        <@ (visual.next->'powerPointResolvedMediaLinks')
                                                    AND coalesce(visual.prior->'powerPointResolvedMediaLinks', '[]'::jsonb)
                                                        <> visual.next->'powerPointResolvedMediaLinks'
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
