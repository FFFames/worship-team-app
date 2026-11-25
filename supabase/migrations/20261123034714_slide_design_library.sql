-- The design catalog follows the existing shared WorshipTeam library access model.
CREATE TABLE public.slide_designs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL CHECK (length(btrim(title)) > 0),
    kind text NOT NULL CHECK (kind IN ('presentation', 'song-theme', 'scripture-theme', 'presentation-theme')),
    content jsonb NOT NULL CHECK ((
        jsonb_typeof(content) = 'object'
        AND jsonb_typeof(content->'slides') = 'array'
        AND content->'slides' <> '[]'::jsonb
    ) IS TRUE),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.slide_designs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.slide_designs TO anon, authenticated;
CREATE POLICY "Shared slide designs" ON public.slide_designs
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Snapshot the applied theme so a later library edit or deletion does not alter a setlist.
ALTER TABLE public.playlist_songs
    ADD COLUMN slide_theme jsonb,
    ADD CONSTRAINT playlist_entry_slide_theme CHECK (
        slide_theme IS NULL OR ((
            jsonb_typeof(slide_theme) = 'object'
            AND jsonb_typeof(slide_theme->'title') = 'string'
            AND length(btrim(slide_theme->>'title')) > 0
            AND jsonb_typeof(slide_theme->'design') = 'object'
            AND jsonb_typeof(slide_theme->'design'->'aspectRatio') = 'number'
            AND jsonb_typeof(slide_theme->'design'->'layers') = 'array'
        ) IS TRUE)
    );
