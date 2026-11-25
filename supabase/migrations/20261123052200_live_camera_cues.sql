-- Allow a camera occurrence while retaining the existing playlist-content invariant.
ALTER TABLE public.playlist_songs
    DROP CONSTRAINT playlist_entry_has_content,
    ADD CONSTRAINT playlist_entry_has_content CHECK ((
        (song_id IS NOT NULL AND cue IS NULL)
        OR (song_id IS NULL AND jsonb_typeof(cue) = 'object'
            AND nullif(btrim(cue->>'label'), '') IS NOT NULL
            AND jsonb_typeof(cue->'slides') = 'array'
            AND cue->>'kind' IN ('song', 'scripture', 'presentation', 'image', 'video', 'audio',
                                 'web', 'camera', 'powerpoint', 'unknown'))
    ) IS TRUE);
