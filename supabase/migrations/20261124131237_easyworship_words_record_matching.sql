-- Recognize an unchanged native word record across copies of a SQLite database.
ALTER TABLE public.songs
    ADD COLUMN easyworship_words_record_id uuid
        CHECK (easyworship_words_record_id IS NULL OR easyworship_words_id IS NOT NULL),
    DROP CONSTRAINT songs_easyworship_import_alias,
    ADD CONSTRAINT songs_easyworship_import_alias CHECK (
        easyworship_import_id IS NULL OR (
            easyworship_words_id IS NOT NULL AND id <> easyworship_import_id
            AND (id = easyworship_words_id OR id IS NOT DISTINCT FROM easyworship_words_record_id)
        )
    );
CREATE INDEX songs_easyworship_words_record_id_idx ON public.songs (easyworship_words_record_id)
WHERE easyworship_words_record_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.import_easyworship_word_songs(p_songs jsonb)
RETURNS TABLE (import_id uuid, destination_id uuid, inserted boolean, filled boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    incoming record;
    snapshot_song public.songs%ROWTYPE;
    record_matches uuid[];
BEGIN
    -- Serialize short import batches because a catalog ID and a words ID can refer to the same row.
    PERFORM pg_advisory_xact_lock(hashtextextended('import_easyworship_word_songs', 0));

    FOR incoming IN SELECT * FROM jsonb_to_recordset(p_songs) AS input(
        id uuid, words_id uuid, words_record_id uuid, lyrics_only boolean, recovery_title text, title text,
        artist text, copyright text, ccli_number text, raw_content text, sections jsonb, appearance jsonb
    )
    LOOP
        IF incoming.id IS NULL OR incoming.words_id IS NULL OR incoming.lyrics_only IS NULL
            OR incoming.recovery_title IS NULL
            OR incoming.lyrics_only <> (incoming.id = incoming.words_id OR incoming.id IS NOT DISTINCT FROM incoming.words_record_id)
        THEN
            RAISE EXCEPTION 'Invalid SongWords identity' USING ERRCODE = '22023';
        END IF;

        import_id := incoming.id;
        inserted := false;
        filled := false;
        SELECT song.id INTO destination_id FROM public.songs AS song
        WHERE song.id = incoming.id OR song.easyworship_import_id = incoming.id
        ORDER BY (song.id = incoming.id) DESC, song.id LIMIT 1 FOR UPDATE;
        SELECT * INTO snapshot_song FROM public.songs AS song
        WHERE song.easyworship_words_id = incoming.words_id
        ORDER BY (song.id = incoming.words_id) DESC,
            (song.id IS NOT DISTINCT FROM incoming.words_record_id) DESC, song.id LIMIT 1 FOR UPDATE;
        IF snapshot_song.id IS NULL AND destination_id IS NULL AND incoming.words_record_id IS NOT NULL THEN
            -- Library backups can contain copies with different song IDs. Reuse a record only when it is unambiguous.
            SELECT array_agg(candidate.id) INTO record_matches
            FROM (
                SELECT song.id FROM public.songs AS song
                WHERE song.easyworship_words_record_id = incoming.words_record_id
                LIMIT 2
            ) AS candidate;
            IF cardinality(record_matches) = 1 THEN
                SELECT * INTO snapshot_song FROM public.songs AS song WHERE song.id = record_matches[1] FOR UPDATE;
            END IF;
        END IF;

        IF destination_id IS NOT NULL THEN
            UPDATE public.songs
            SET easyworship_words_id = coalesce(easyworship_words_id, incoming.words_id),
                easyworship_words_record_id = coalesce(easyworship_words_record_id, incoming.words_record_id)
            WHERE id = destination_id
              AND ((easyworship_words_id IS NULL AND snapshot_song.id IS NULL)
                OR (easyworship_words_id = incoming.words_id AND easyworship_words_record_id IS NULL
                    AND incoming.words_record_id IS NOT NULL));
        ELSIF snapshot_song.id IS NOT NULL AND incoming.lyrics_only THEN
            UPDATE public.songs SET easyworship_words_record_id = incoming.words_record_id
            WHERE id = snapshot_song.id AND easyworship_words_record_id IS NULL AND incoming.words_record_id IS NOT NULL;
            destination_id := snapshot_song.id;
        ELSIF snapshot_song.easyworship_import_id IS NULL
            AND snapshot_song.id IN (snapshot_song.easyworship_words_id, snapshot_song.easyworship_words_record_id)
        THEN
            UPDATE public.songs
            SET title = CASE WHEN title = incoming.recovery_title THEN incoming.title ELSE title END,
                artist = coalesce(nullif(artist, ''), incoming.artist),
                copyright = coalesce(nullif(copyright, ''), incoming.copyright),
                ccli_number = coalesce(nullif(ccli_number, ''), incoming.ccli_number),
                easyworship_import_id = incoming.id,
                easyworship_words_record_id = coalesce(easyworship_words_record_id, incoming.words_record_id)
            WHERE id = snapshot_song.id;
            destination_id := snapshot_song.id;
            filled := true;
        ELSE
            INSERT INTO public.songs (
                id, title, artist, copyright, ccli_number, raw_content, sections, appearance, user_id,
                easyworship_words_id, easyworship_words_record_id
            ) VALUES (
                incoming.id, incoming.title, incoming.artist, incoming.copyright, incoming.ccli_number, incoming.raw_content,
                incoming.sections, incoming.appearance, 'default',
                CASE WHEN snapshot_song.id IS NULL THEN incoming.words_id END,
                CASE WHEN snapshot_song.id IS NULL THEN incoming.words_record_id END
            ) ON CONFLICT (id) DO NOTHING RETURNING id INTO destination_id;
            inserted := FOUND;
            destination_id := coalesce(destination_id, incoming.id);
        END IF;

        RETURN NEXT;
    END LOOP;
END;
$$;
