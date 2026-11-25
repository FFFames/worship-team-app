-- Legacy EasyWorship backgrounds can be applied to songs and scripture alike.
ALTER TABLE public.slide_designs
    DROP CONSTRAINT slide_designs_kind_check,
    ADD CONSTRAINT slide_designs_kind_check
        CHECK (kind IN ('presentation', 'song-theme', 'scripture-theme', 'text-theme', 'presentation-theme'));
