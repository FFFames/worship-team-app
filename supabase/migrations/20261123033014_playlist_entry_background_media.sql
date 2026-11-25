-- A background belongs to an occurrence and leaves the source song unchanged.
ALTER TABLE public.playlist_songs
    ADD COLUMN background_asset jsonb,
    ADD CONSTRAINT playlist_entry_background_media CHECK (
        background_asset IS NULL OR ((
            jsonb_typeof(background_asset) = 'object'
            AND background_asset->>'kind' IN ('image', 'video')
            AND background_asset->>'role' = 'background'
            AND jsonb_typeof(background_asset->'filename') = 'string'
            AND nullif(btrim(background_asset->>'filename'), '') IS NOT NULL
            AND background_asset->>'libraryId' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
        ) IS TRUE)
    );
