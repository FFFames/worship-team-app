# WorshipTeam — Church Worship Team Web App

## Project Overview
A web app for managing worship team songs, chord charts, playlists, and live presentation. Built with React + TypeScript + Tailwind, backed by Supabase.

## Architecture
- **Frontend:** React 18 + Vite 5 + TypeScript 5
- **Styling:** Tailwind CSS 3 (dark-mode-native design inspired by Supabase aesthetic)
- **State:** Zustand for client UI state, Supabase for all persistent data
- **Backend:** Supabase Free Tier (PostgreSQL + RLS)
- **PDF:** jsPDF + html2canvas
- **Presentation:** Fullscreen API + BroadcastChannel API for dual-window sync

## Key Commands
- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run preview` — preview production build
- `npx vitest run` — run tests
- `npx vitest` — run tests in watch mode

## Project Structure
```
src/
  components/    — Reusable UI components
  hooks/         — React hooks (Supabase data hooks in useSongs.ts, usePlaylists.ts, etc.)
  utils/         — Pure utility functions (chordParser.ts, transpose.ts, pdfExport.ts)
  types/         — TypeScript type definitions (database.ts for Supabase schema types)
  store/         — Zustand stores (songEditorStore.ts, presentationStore.ts, uiStore.ts)
  lib/           — External client setup (supabase.ts)
  pages/         — Route-level page components
```

## Supabase Schema Reference

### songs
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | auto-generated |
| title | text NOT NULL | |
| artist | text nullable | |
| original_key | text NOT NULL | e.g. "C", "G", "Bb" |
| content_raw | text NOT NULL | original pasted text |
| content_parsed | jsonb NOT NULL | structured { sections: [...] } |
| created_by | uuid FK nullable | |
| created_at | timestamptz | auto |
| updated_at | timestamptz | auto via trigger |

### playlists
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | auto |
| name | text NOT NULL | |
| description | text nullable | |
| created_by | uuid FK nullable | |
| created_at | timestamptz | auto |
| updated_at | timestamptz | auto via trigger |

### playlist_songs
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | auto |
| playlist_id | uuid FK → playlists | CASCADE delete |
| song_id | uuid FK → songs | CASCADE delete |
| position | integer NOT NULL | ordering |
| transpose_semitones | integer default 0 | per-song transpose |
| UNIQUE | (playlist_id, song_id) | |
| UNIQUE | (playlist_id, position) | |

### video_backgrounds
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | auto |
| name | text NOT NULL | |
| url | text NOT NULL | video URL |
| is_default | boolean default false | |
| created_at | timestamptz | auto |

## content_parsed JSONB Structure
```json
{
  "sections": [
    {
      "type": "verse",
      "marker": "",
      "lines": [
        { "chords": "C    G    Am   F", "lyrics": "Amazing grace how sweet the sound" }
      ]
    }
  ]
}
```

Section type → marker mapping:
- `verse` → `""`
- `pre_chorus` → `"*"`
- `chorus` → `"**"`
- `bridge` → `"***"`
- `intro` → `"[Intro]"`
- `outro` → `"[Outro]"`
- `interlude` → `"[Interlude]"`
- `tag` → `"[Tag]"`

## Code Conventions
- **Tailwind ONLY** for styling — no custom CSS files
- Function components with hooks (no class components)
- All Supabase queries go through custom hooks (`src/hooks/`), never directly in components
- Every file gets a brief comment at top explaining its purpose
- TypeScript strict mode — no `any` types
- 2-space indentation for TS/TSX, 4-space for SQL
- Named exports preferred, default exports only for pages
- Environment variables prefixed with `VITE_`

## Design Language
Dark-mode-native inspired by Supabase:
- Background: `#0f0f0f` (deepest), `#171717` (page)
- Text: `#fafafa` (primary), `#b4b4b4` (secondary), `#898989` (muted)
- Accent: `#3ecf8e` (emerald green) — used sparingly for brand identity
- Borders: `#242424` (subtle), `#2e2e2e` (standard), `#363636` (prominent)
- Font: Inter (via Google Fonts)
- Depth via border contrast, NOT box-shadows
- Pill buttons (9999px radius) for primary CTAs
- Weight 400 for body, 500 for interactive elements only

## Environment Setup
1. Create Supabase project at supabase.com
2. Run `supabase/migrations/001_initial.sql` in SQL Editor
3. Copy `.env.example` to `.env.local`
4. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

## Routes
- `/` — Song Library
- `/songs/new` — Song Editor (new)
- `/songs/:id` — Song Detail
- `/songs/:id/edit` — Song Editor (edit)
- `/playlists` — Playlist List
- `/playlists/:id` — Playlist Detail
- `/playlists/:id/stage` — Stage View
- `/playlists/:id/present` — Presentation Control
- `/playlists/:id/pdf` — PDF Export
