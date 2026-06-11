# WorshipTeam — Database Schema Analysis

## Summary of Findings

The existing migration `001_initial.sql` has **12 significant mismatches** with what the TypeScript code actually sends/reads from Supabase. The app **will not work** against the 001_initial.sql schema without fixes.

---

## 1. Complete Mismatch Table

### `songs` table (7 mismatches)

| # | Migration (001_initial.sql) | Code expects (TS types + hooks) | Issue |
|---|---|---|---|
| 1 | `content_raw text NOT NULL` | `raw_content text NOT NULL` | **NAME MISMATCH** — code sends `raw_content`, DB has `content_raw` |
| 2 | `content_parsed jsonb NOT NULL` | `sections jsonb (nullable)` | **NAME + NULLABILITY MISMATCH** — code sends `sections`, DB has `content_parsed` |
| 3 | `created_by uuid REFERENCES auth.users(id)` | `user_id text nullable` | **NAME + TYPE MISMATCH** — code sends `user_id: 'default'` (string), DB expects uuid FK |
| 4 | *(missing)* | `tempo integer nullable` | **MISSING COLUMN** — code sends `tempo: 120` on insert |
| 5 | *(missing)* | `time_signature text nullable` | **MISSING COLUMN** — code sends `time_signature: '4/4'` on insert |
| 6 | *(missing)* | `tags text[] nullable` | **MISSING COLUMN** — code sends `tags: []` on insert |
| 7 | *(missing)* | `favorite boolean nullable` | **MISSING COLUMN** — code sends `favorite: false` on insert |

### `playlists` table (3 mismatches)

| # | Migration (001_initial.sql) | Code expects (TS types + hooks) | Issue |
|---|---|---|---|
| 1 | `description text nullable` | `notes text nullable` | **NAME MISMATCH** — code reads/writes `notes`, DB has `description` |
| 2 | `created_by uuid REFERENCES auth.users(id)` | `user_id text nullable` | **NAME + TYPE MISMATCH** — code sends `user_id: 'default'` (string) |
| 3 | *(missing)* | `date text nullable` | **MISSING COLUMN** — code sends `date: new Date().toISOString().split('T')[0]` |

### `playlist_songs` table (3 mismatches)

| # | Migration (001_initial.sql) | Code expects (TS types + hooks) | Issue |
|---|---|---|---|
| 1 | `position integer NOT NULL` | `order integer NOT NULL` | **NAME MISMATCH** — code sends/reads `order`, DB has `position` |
| 2 | `transpose_semitones integer DEFAULT 0` | `transpose integer DEFAULT 0` | **NAME MISMATCH** — code sends/reads `transpose`, DB has `transpose_semitones` |
| 3 | *(missing)* | `created_at timestamptz` | **MISSING COLUMN** — TypeScript type expects it |

### `video_backgrounds` table — ✅ No mismatches. Matches perfectly.

---

## 2. Exact Schema the Code Expects (from TypeScript analysis)

### `songs`

| Column | PostgreSQL Type | Nullable | Default | Notes |
|--------|----------------|----------|---------|-------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `title` | `text` | NO | — | |
| `artist` | `text` | YES | — | |
| `original_key` | `text` | NO | `'C'` | e.g. "C", "G#", "Bb" |
| `tempo` | `integer` | YES | `120` | code default: `song.tempo ?? 120` |
| `time_signature` | `text` | YES | `'4/4'` | code default: `song.time_signature ?? '4/4'` |
| `raw_content` | `text` | NO | `''` | raw chord+lyrics text |
| `sections` | `jsonb` | YES | `null` | `DbSongSection[]` or null |
| `user_id` | `text` | YES | `null` | hardcoded `'default'` in hooks |
| `tags` | `text[]` | YES | `'{}'` | code default: `song.tags ?? []` |
| `favorite` | `boolean` | YES | `false` | code default: `song.favorite ?? false` |
| `created_at` | `timestamptz` | NO | `now()` | auto |
| `updated_at` | `timestamptz` | NO | `now()` | auto via trigger |

### `playlists`

| Column | PostgreSQL Type | Nullable | Default | Notes |
|--------|----------------|----------|---------|-------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `name` | `text` | NO | — | |
| `date` | `text` | YES | `null` | ISO date string e.g. "2026-06-11" |
| `notes` | `text` | YES | `null` | replaces old "description" |
| `user_id` | `text` | YES | `null` | hardcoded `'default'` in hooks |
| `created_at` | `timestamptz` | NO | `now()` | auto |
| `updated_at` | `timestamptz` | NO | `now()` | auto via trigger |

### `playlist_songs`

| Column | PostgreSQL Type | Nullable | Default | Notes |
|--------|----------------|----------|---------|-------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `playlist_id` | `uuid` | NO | — | FK → playlists(id) ON DELETE CASCADE |
| `song_id` | `uuid` | NO | — | FK → songs(id) ON DELETE CASCADE |
| `transpose` | `integer` | NO | `0` | semitone offset |
| `order` | `integer` | NO | `0` | must be double-quoted (reserved word) |
| `created_at` | `timestamptz` | NO | `now()` | auto |
| | | | | UNIQUE (playlist_id, song_id) |

### `video_backgrounds`

| Column | PostgreSQL Type | Nullable | Default | Notes |
|--------|----------------|----------|---------|-------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `name` | `text` | NO | — | |
| `url` | `text` | NO | — | |
| `is_default` | `boolean` | NO | `false` | |
| `created_at` | `timestamptz` | NO | `now()` | auto |

---

## 3. Code / Hook Issues Found

### Bug 1: `reorderSongs` uses song_id instead of playlist_song id (usePlaylists.ts + PlaylistDetail.tsx)

**Location:** `PlaylistDetail.tsx` line 57 + `usePlaylists.ts` lines 159-172

**Problem:**
```tsx
// PlaylistDetail.tsx:57 — extracts SONG IDs
const orderedIds = reordered.map((ps) => ps.song_id)
await reorderSongs(orderedIds)

// usePlaylists.ts:163-168 — treats them as PLAYLIST_SONG IDs
orderedIds.map((psId, index) =>
  supabase.from('playlist_songs').update({ order: index }).eq('id', psId)
)
```

The `reorderSongs` hook uses `.eq('id', psId)` matching on `playlist_songs.id`, but the caller passes `song_id` values. This means **reordering silently fails** (no matching rows) or could update wrong rows if a song_id coincidentally matches a playlist_songs.id.

**Fix:** Change `PlaylistDetail.tsx` line 57 to:
```tsx
const orderedIds = reordered.map((ps) => ps.id)  // ps.id is the playlist_songs PK
```

### Bug 2: `user_id: 'default'` hardcoded string

**Location:** `useSongs.ts` line 60, `usePlaylists.ts` line 42

The hooks hardcode `user_id: 'default'` as a string. The old migration had `created_by uuid REFERENCES auth.users(id)` which would reject this value. The corrected schema changes the column to `text` type (no FK constraint) so it works, but this should be properly integrated with Supabase Auth when authentication is added.

### Bug 3: `SongEditor.tsx` doesn't save `sections` to DB

**Location:** `SongEditor.tsx` lines 249-265

When creating/updating a song, the editor only sends `{ title, artist, original_key, raw_content }`. It does NOT send `sections` (the parsed JSONB). The parsed content is used only for live preview in the editor. When displaying songs (`SongDetail.tsx`, `StageView.tsx`), the code re-parses `raw_content` on the fly via `parseChordLyrics(song.raw_content)`, so this works — but it means the `sections` column is never populated by the editor, making it dead weight.

**Fix option:** Either send parsed sections on save, or remove the `sections` column from the schema entirely.

### Bug 4: `updateSong` sends raw `Partial<SongInsert>` without filtering

**Location:** `useSongs.ts` line 75

The `updateSong` hook passes the full `updates` object directly to Supabase's `.update()`. If a caller accidentally includes fields that don't exist in the DB, Supabase will return an error. No field whitelist/validation is applied.

### Bug 5: No error handling in `reorderSongs` `Promise.all`

**Location:** `usePlaylists.ts` lines 163-171

The `Promise.all(updates)` call doesn't check individual results. If some updates fail and others succeed, the playlist order will be in an inconsistent state. Should use `Promise.allSettled()` or batch in a transaction.

### Bug 6: `useVideoBackgrounds` silently swallows errors

**Location:** `useVideoBackgrounds.ts` line 24

The `catch` block in `fetchBackgrounds` logs to console and returns an empty array with no error state. The hook doesn't expose an `error` field, so components can't know if the fetch failed.

### Issue 7: `order` is a PostgreSQL reserved word

The code uses `order` as a column name in `playlist_songs`. PostgreSQL allows this but **requires double-quoting** everywhere (`"order"`). The Supabase JS client sends unquoted column names which get auto-lowercased, and Supabase handles this correctly for `.select('order')` and `.update({ order: ... })`, but raw SQL queries against this column must always quote it.

### Issue 8: `sections` JSONB structure mismatch in CLAUDE.md

The `CLAUDE.md` docs describe `content_parsed` as having structure `{ sections: [{ type, marker, lines: [{ chords, lyrics }] }] }` (the `SongContent`/`Section`/`SongLine` format from chordParser). But the TypeScript `DbSongSection` type defines a completely different structure: `{ lines: [{ segments: [{ text, chord?, startIndex }], originalText }] }`. These are two different JSONB schemas — the code uses the `SongContent` format in the parser/editor but the `DbSongSection` format in the TypeScript types. The hooks never actually read or write the `sections` column, so this ambiguity doesn't cause runtime errors, but it's confusing.

---

## 4. Corrected Migration File

Created at: `supabase/migrations/002_fix_schema_match_code.sql`

This file:
- Drops all tables from `001_initial.sql`
- Recreates them with column names/types that exactly match the TypeScript code
- Preserves all indexes, triggers, RLS policies, and seed data
- Handles the `order` reserved word with double-quoting
- Changes `user_id` from uuid FK to plain text to match hardcoded `'default'` string

**To apply on a fresh database:** Run only `002_fix_schema_match_code.sql` (it's self-contained).
**To migrate existing data:** A data migration script would be needed to rename columns and add new ones.
