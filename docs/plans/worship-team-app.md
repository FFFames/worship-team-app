# WorshipTeam App — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a complete worship team web app with chord/lyrics management, transposition, playlists, stage view, PDF export, and presentation mode — backed by Supabase.

**Architecture:** React SPA (Vite + TypeScript + Tailwind) with Supabase as sole backend. Zustand for client-side UI state. BroadcastChannel API for presenter/control screen sync. jsPDF for PDF export.

**Tech Stack:** React 18, Vite 5, TypeScript 5, Tailwind CSS 3, Supabase JS v2, Zustand, jsPDF, html2canvas

---

## Phase 0: Project Scaffold

### Task 0.1: Scaffold Vite + React + TypeScript project

**Objective:** Initialize the project with Vite, React, TypeScript, Tailwind, and all dependencies.

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `src/main.tsx`, `src/App.tsx`, `src/index.css`
- Create: `.env.example`

**Step 1: Scaffold with Vite**
```bash
cd ~/Projects/worship-team-app
npm create vite@latest . -- --template react-ts
```

**Step 2: Install dependencies**
```bash
npm install react-router-dom @supabase/supabase-js zustand jspdf html2canvas
npm install -D tailwindcss @tailwindcss/vite postcss autoprefixer
```

**Step 3: Configure Tailwind** in `tailwind.config.ts` and `src/index.css`:
```css
@import "tailwindcss";
```

**Step 4: Configure Vite** — add Tailwind plugin to `vite.config.ts`

**Step 5: Create `.env.example`**
```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Step 6: Create folder structure**
```
src/
  components/
  hooks/
  utils/
  types/
  store/
  lib/
  pages/
```

**Step 7: Commit**
```bash
git add -A && git commit -m "chore: scaffold vite + react + tailwind + deps"
```

---

## Phase 1: Foundation Layer

### Task 1.1: Supabase client setup

**Objective:** Create the Supabase client singleton and environment variable config.

**Files:**
- Create: `src/lib/supabase.ts`

**Implementation:**
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**Verify:** Import succeeds, no errors.

---

### Task 1.2: TypeScript database types

**Objective:** Generate TypeScript types matching the Supabase schema.

**Files:**
- Create: `src/types/database.ts`

**Implementation:** Define all table types — Song, Playlist, PlaylistSong, VideoBackground, plus the content_parsed JSONB structure (Section, SongLine). Export a Database interface for Supabase generic typing.

```typescript
export type SongLine = {
  chords: string;
  lyrics: string;
};

export type SectionType = 'verse' | 'pre_chorus' | 'chorus' | 'bridge' | 'intro' | 'outro' | 'interlude' | 'tag';

export type Section = {
  type: SectionType;
  marker: string;
  lines: SongLine[];
};

export type SongContent = {
  sections: Section[];
};

export type Song = {
  id: string;
  title: string;
  artist: string | null;
  original_key: string;
  content_raw: string;
  content_parsed: SongContent;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Playlist = {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PlaylistSong = {
  id: string;
  playlist_id: string;
  song_id: string;
  position: number;
  transpose_semitones: number;
  song?: Song; // joined
};

export type VideoBackground = {
  id: string;
  name: string;
  url: string;
  is_default: boolean;
  created_at: string;
};
```

**Verify:** Types compile without errors.

---

### Task 1.3: Chord parser utility

**Objective:** Parse raw pasted chord+lyrics text into structured SongContent.

**Files:**
- Create: `src/utils/chordParser.ts`
- Create: `src/utils/chordParser.test.ts`

**Implementation:**

`chordParser.ts` exports:
- `parseChordLyrics(rawText: string): SongContent` — main parser
- `detectKey(sections: Section[]): string` — auto-detect song key from first chord

**Parser rules:**
1. Split input by lines
2. Detect section headers: lines matching `/^\s*\[(Verse|Chorus|Pre-Chorus|Pre-Chorus|Bridge|Hook|Intro|Outro|Interlude|Tag)\s*(\d*)\s*]/i` or `/^\s*(Verse|Chorus|Pre-Chorus|...)\s*(\d*)\s*:/i`
3. Section marker mapping:
   - verse → `""`
   - pre_chorus → `"*"`
   - chorus → `"**"`
   - bridge → `"***"`
   - intro → `"[Intro]"`
   - outro → `"[Outro]"`
   - interlude → `"[Interlude]"`
   - tag → `"[Tag]"`
4. Detect chord lines: lines where the majority of non-space characters match chord patterns (`/^[A-G][#b]?(m|maj|min|dim|aug|sus|add|7|9|11|13)?/`)
5. Pair chord lines with the following lyric line
6. Return structured `SongContent`

**Test cases:**
- Simple two-line format
- ChordPro format (`[C]Amazing [G]grace`)
- Multiple sections with headers
- Sections without headers (treated as verse)
- Mixed formats

**Verify:** `npx vitest run src/utils/chordParser.test.ts` — all tests pass.

---

### Task 1.4: Transpose utility

**Objective:** Pure functions for transposing chord strings and key names.

**Files:**
- Create: `src/utils/transpose.ts`
- Create: `src/utils/transpose.test.ts`

**Implementation:**

`transpose.ts` exports:
- `transposeChord(chord: string, semitones: number, useFlats?: boolean): string` — transpose a single chord
- `transposeChordLine(line: string, semitones: number, useFlats?: boolean): string` — transpose all chords in a line
- `transposeKey(key: string, semitones: number, useFlats?: boolean): string` — transpose a key name
- `CHROMATIC_SHARP` and `CHROMATIC_FLAT` constants
- `formatKey(key: string, useFlats: boolean): string` — convert key to sharps or flats

**Chord parsing regex:** `/([A-G][#b]?)(.*)/` — separates root from suffix (m, maj7, sus4, etc.)

**Verify:** `npx vitest run src/utils/transpose.test.ts` — all tests pass.

---

### Task 1.5: Zustand stores

**Objective:** Create Zustand stores for client-side UI state.

**Files:**
- Create: `src/store/songEditorStore.ts`
- Create: `src/store/presentationStore.ts`
- Create: `src/store/uiStore.ts`

**songEditorStore:**
- `rawText: string` — current editor content
- `parsedContent: SongContent | null`
- `detectedKey: string`
- `transpose: number` (semitones)
- `useFlats: boolean`
- `setRawText(text: string)`
- `parse()` — run parser, update parsedContent + detectedKey
- `setTranspose(semitones: number)`
- `reset()`

**presentationStore:**
- `currentPlaylistId: string | null`
- `currentSongIndex: number`
- `currentBlockIndex: number`
- `isShowingWelcome: boolean`
- `isBlacked: boolean`
- `videoBackground: VideoBackground | null`
- `setSong(index: number)`
- `setBlock(index: number)`
- `showWelcome()`
- `showBlack()`
- `setVideoBackground(bg: VideoBackground | null)`

**uiStore:**
- `sidebarOpen: boolean`
- `theme: 'dark' | 'light'`

**Verify:** Stores instantiate without errors.

---

## Phase 2: Supabase Data Hooks

### Task 2.1: Songs CRUD hooks

**Objective:** React hooks for all song operations against Supabase.

**Files:**
- Create: `src/hooks/useSongs.ts`
- Create: `src/hooks/useSong.ts`

**useSongs():**
- `songs: Song[]` — all songs, ordered by created_at desc
- `loading: boolean`
- `error: string | null`
- `search(query: string): void` — filters via Supabase ilike on title + artist
- `addSong(song: InsertSong): Promise<Song>`
- `updateSong(id: string, updates: Partial<Song>): Promise<void>`
- `deleteSong(id: string): Promise<void>`
- `refresh(): void`

**useSong(id: string):**
- `song: Song | null`
- `loading: boolean`
- `updateSong(updates): Promise<void>`
- `deleteSong(): Promise<void>`

**Verify:** Hooks return correct types, Supabase queries match schema.

---

### Task 2.2: Playlists CRUD hooks

**Objective:** React hooks for playlists and playlist_songs.

**Files:**
- Create: `src/hooks/usePlaylists.ts`
- Create: `src/hooks/usePlaylist.ts`

**usePlaylists():**
- `playlists: Playlist[]`
- `loading: boolean`
- `createPlaylist(name: string, description?: string): Promise<Playlist>`
- `updatePlaylist(id: string, updates): Promise<void>`
- `deletePlaylist(id: string): Promise<void>`

**usePlaylist(playlistId: string):**
- `playlist: Playlist | null`
- `songs: PlaylistSong[]` — joined with songs table, ordered by position
- `loading: boolean`
- `addSong(songId: string): Promise<void>` — inserts at next position
- `removeSong(songId: string): Promise<void>`
- `reorderSongs(songIds: string[]): Promise<void>` — batch update positions
- `setTranspose(songId: string, semitones: number): Promise<void>`

**Verify:** All CRUD operations typed correctly.

---

### Task 2.3: Video backgrounds hook

**Objective:** React hook for fetching video backgrounds.

**Files:**
- Create: `src/hooks/useVideoBackgrounds.ts`

**useVideoBackgrounds():**
- `backgrounds: VideoBackground[]`
- `loading: boolean`
- `addBackground(name: string, url: string): Promise<void>`
- `removeBackground(id: string): Promise<void>`

---

## Phase 3: UI Components — Shared

### Task 3.1: App layout + React Router setup

**Objective:** Main app shell with navigation and routing.

**Files:**
- Modify: `src/App.tsx`
- Create: `src/components/Layout.tsx`
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/Navbar.tsx`

**Routes:**
- `/` → Song Library
- `/songs/new` → Song Editor (new)
- `/songs/:id` → Song Detail
- `/songs/:id/edit` → Song Editor (edit)
- `/playlists` → Playlist List
- `/playlists/:id` → Playlist Detail
- `/playlists/:id/stage` → Stage View
- `/playlists/:id/present` → Presentation Control
- `/playlists/:id/pdf` → PDF Export (auto-download)

**Layout:** Sidebar navigation (Songs, Playlists) + main content area. Dark theme by default using Supabase design language.

**Verify:** All routes render without errors, navigation works.

---

### Task 3.2: Chord display component

**Objective:** Reusable component for rendering aligned chords+lyrics.

**Files:**
- Create: `src/components/ChordDisplay.tsx`

**Props:**
- `sections: Section[]`
- `transpose: number`
- `useFlats: boolean`
- `showChords: boolean` (true for stage, false for presentation)
- `className?: string`

**Behavior:**
- Renders each section with its marker
- Uses monospace font for chord alignment
- Applies transpose to all chord lines
- Chords render in a color distinct from lyrics (e.g., emerald green for chords)

**Verify:** Renders sample song correctly with aligned chords.

---

### Task 3.3: Transpose controls component

**Objective:** Reusable transpose button bar.

**Files:**
- Create: `src/components/TransposeControls.tsx`

**Props:**
- `currentKey: string`
- `transpose: number`
- `useFlats: boolean`
- `onTransposeChange: (semitones: number) => void`
- `onFlatsToggle: () => void`

**UI:** Row of buttons: -5, -2, -1, current key, +1, +2, +5. Toggle for ♭/♯.

**Verify:** Buttons trigger correct callbacks.

---

## Phase 4: Song Editor + Library

### Task 4.1: Song Editor page

**Objective:** Full song creation/editing experience with live preview.

**Files:**
- Create: `src/pages/SongEditor.tsx`
- Create: `src/components/ChordAligner.tsx`

**SongEditor page:**
- Textarea for pasting raw chord+lyrics
- "Parse" button → runs chordParser → populates preview
- Auto-detected key display (editable dropdown)
- Live preview panel showing parsed ChordDisplay
- ChordAligner: click on a chord → drag left/right to re-align with lyrics. Updates character offsets in the section data.
- "Save" button → upserts to Supabase via useSongs hook
- "Cancel" → navigate back

**ChordAligner interaction:**
- Each chord rendered as a draggable span
- onMouseDown starts drag tracking
- onMouseMove updates chord offset (character position)
- onMouseUp finalizes position
- Visual cursor feedback during drag

**Verify:** Can paste a song, parse it, align chords, save to Supabase, and retrieve it.

---

### Task 4.2: Song Library page

**Objective:** Searchable, filterable list of all songs.

**Files:**
- Create: `src/pages/SongLibrary.tsx`
- Create: `src/components/SongCard.tsx`

**SongLibrary:**
- Search input (debounced 300ms) → calls useSongs().search()
- Grid/list of SongCards
- "New Song" button → navigate to /songs/new
- Sort by: title, date added, key

**SongCard:**
- Shows title, artist, key, date
- Click → navigate to /songs/:id
- Edit/Delete actions

**Verify:** Songs load from Supabase, search filters correctly, navigation works.

---

### Task 4.3: Song Detail page

**Objective:** View a single song with transpose controls.

**Files:**
- Create: `src/pages/SongDetail.tsx`

**Features:**
- Fetches song via useSong(id)
- ChordDisplay with transpose controls
- Edit button → /songs/:id/edit
- Delete confirmation modal

**Verify:** Song renders with correct key, transpose works in real-time.

---

## Phase 5: Playlist Manager

### Task 5.1: Playlist List page

**Objective:** List all playlists with CRUD.

**Files:**
- Create: `src/pages/PlaylistList.tsx`
- Create: `src/components/PlaylistCard.tsx`

**Features:**
- "Create Playlist" button → inline name input or modal
- Grid of PlaylistCards
- Each card: name, description, song count, date
- Click → /playlists/:id
- Edit (rename) / Delete actions

**Verify:** CRUD operations work against Supabase.

---

### Task 5.2: Playlist Detail page

**Objective:** Manage songs within a playlist.

**Files:**
- Create: `src/pages/PlaylistDetail.tsx`
- Create: `src/components/SongSearchModal.tsx`
- Create: `src/components/PlaylistSongItem.tsx`

**Features:**
- Fetches playlist + songs via usePlaylist(id)
- Drag-to-reorder songs (HTML5 drag API)
- "Add Song" button → opens SongSearchModal
  - Modal: search all songs, click to add (inserts at end)
- Each PlaylistSongItem shows:
  - Position number, title, key
  - Per-song transpose (-2, -1, key, +1, +2)
  - Remove button
- 3 action buttons at top: "Stage", "Export PDF", "Present"

**SongSearchModal:**
- Search input → queries Supabase songs
- Results list with "Add" button per song
- Already-added songs shown as disabled

**Verify:** Add/remove/reorder songs, transpose saves to DB.

---

## Phase 6: Stage View

### Task 6.1: Stage View page

**Objective:** Performance-optimized dark view for on-stage use.

**Files:**
- Create: `src/pages/StageView.tsx`

**Features:**
- Fetches playlist + songs via usePlaylist(id)
- Scrollable list of all songs
- Each song rendered as ChordDisplay with section markers
- Per-song transpose controls (compact)
- Auto-scroll toggle (scrolls through all songs at configurable speed)
- Dark background (#0f0f0f), high contrast text
- Large, readable font sizes (16px chords, 18px lyrics minimum)
- Quick-jump to song via sticky song list at top

**Verify:** Renders all songs, transpose works, auto-scroll functions.

---

## Phase 7: PDF Export

### Task 7.1: PDF Export utility

**Objective:** Generate A4 PDF with 2 songs per page (side by side).

**Files:**
- Create: `src/utils/pdfExport.ts`

**Implementation:**
- A4 dimensions: 210mm × 297mm
- Two columns: left (x=10mm, w=90mm), right (x=110mm, w=90mm)
- Each song: title (bold, 12pt), key (10pt), then chord+lyric lines (9pt monospace)
- Song overflow: if a song exceeds one column, it continues in the next available column/page
- Uses jsPDF directly (no html2canvas needed for text)
- Returns Blob for download

**pdfExport.ts exports:**
- `exportPlaylistToPDF(playlistSongs: PlaylistSong[]): Blob`
- Uses transpose utility to render transposed chords

**Verify:** Generates valid PDF with correct layout.

---

### Task 7.2: PDF Export page (trigger)

**Objective:** Page that auto-triggers PDF download.

**Files:**
- Create: `src/pages/PdfExport.tsx`

**Behavior:**
- Fetches playlist songs
- Calls exportPlaylistToPDF()
- Triggers download with filename `{playlist-name}.pdf`
- Shows success message + "Back to Playlist" link

---

## Phase 8: Presentation Mode

### Task 8.1: BroadcastChannel communication layer

**Objective:** Establish communication between control and presenter windows.

**Files:**
- Create: `src/utils/presentationChannel.ts`

**Implementation:**
```typescript
type PresentationMessage =
  | { type: 'SHOW_LYRICS'; lyrics: string; background?: string }
  | { type: 'SHOW_WELCOME'; background?: string }
  | { type: 'SHOW_BLACK' }
  | { type: 'SET_BACKGROUND'; url: string }
  | { type: 'CLOSE' };
```
- Creates BroadcastChannel('worshipteam-presentation')
- Control screen: sends messages
- Presenter screen: receives messages and renders

---

### Task 8.2: Presenter Screen

**Objective:** Fullscreen display window for projector.

**Files:**
- Create: `src/pages/PresenterScreen.tsx`

**Features:**
- Listens on BroadcastChannel for messages
- Renders:
  - SHOW_LYRICS: large centered white text on video/image background
  - SHOW_WELCOME: "Welcome to Worship" text with background
  - SHOW_BLACK: pure black screen
- Video background: `<video>` element with loop + autoplay
- Fade transitions (CSS transition: opacity 0.3s ease)
- Auto-requests fullscreen on mount
- No chords shown — lyrics only
- Large font: 48px+ for main text

---

### Task 8.3: Presentation Control Screen

**Objective:** Main control interface for the presentation operator.

**Files:**
- Create: `src/pages/PresentationControl.tsx`
- Create: `src/components/LyricsBlockList.tsx`
- Create: `src/components/PresentationPreview.tsx`

**Layout (3-panel):**
```
┌──────────┬───────────────────┬──────────┐
│ Song     │ Lyrics Blocks     │ Preview  │
│ List     │ (click to project)│ (mirror) │
│          │                   │          │
│ [Song 1] │ Block 1           │ Shows    │
│ [Song 2] │ Block 2  ←current │ what's   │
│ [Song 3] │ Block 3           │ on       │
│          │                   │ screen   │
├──────────┴───────────────────┴──────────┤
│ [Welcome] [Black] [Video: ▼] [Key: C]  │
└─────────────────────────────────────────┘
```

**Song List (left panel):**
- All songs in playlist, click to jump
- Highlight current song

**Lyrics Blocks (center panel):**
- Current song split into blocks of 2-3 lines
- Click a block → sends SHOW_LYRICS to presenter
- Highlight currently projected block

**Preview (right panel):**
- Miniature version of what the presenter screen shows
- Updates in real-time via local state sync

**Bottom toolbar:**
- "Welcome" button → sends SHOW_WELCOME
- "Black" button → sends SHOW_BLACK
- Video background dropdown → fetches from useVideoBackgrounds, sends SET_BACKGROUND
- Key display + transpose for current song

**Lyrics block splitting:**
- Split sections into groups of 2-3 lines
- Each group becomes a clickable block
- Group by section boundary (don't split across sections)

**Verify:** Control screen opens presenter window, messages sync, preview matches.

---

## Phase 9: Integration & Polish

### Task 9.1: Wire all routes + test navigation

**Objective:** Ensure all pages connect and navigation flows correctly.

**Verify:** Navigate through all user flows:
- Create song → view in library → open detail → edit → save
- Create playlist → add songs → reorder → transpose
- Open stage view → transpose → auto-scroll
- Export PDF → download
- Open presentation → control → presenter sync

---

### Task 9.2: Seed data script

**Objective:** SQL seed file with sample worship songs for testing.

**Files:**
- Create: `supabase/seeds/001_sample_songs.sql`

**Content:** 5-6 well-known worship songs with properly parsed content_raw and content_parsed JSONB.

---

### Task 9.3: Final build + deploy config

**Objective:** Production build and deployment readiness.

**Files:**
- Modify: `vite.config.ts` (if needed)
- Create: `vercel.json` or `netlify.toml` (SPA redirect rules)

**Verify:** `npm run build` succeeds, `npm run preview` serves correctly.

---

## Task Dependency Graph

```
Phase 0: Scaffold (Task 0.1) — no deps
    │
Phase 1: Foundation
    ├── Task 1.1 Supabase client     ← depends on 0.1
    ├── Task 1.2 Database types       ← depends on 0.1
    ├── Task 1.3 Chord parser         ← depends on 1.2
    ├── Task 1.4 Transpose utility    ← depends on 0.1
    └── Task 1.5 Zustand stores       ← depends on 1.2
         │
Phase 2: Data Hooks
    ├── Task 2.1 Songs hooks          ← depends on 1.1, 1.2
    ├── Task 2.2 Playlists hooks      ← depends on 1.1, 1.2
    └── Task 2.3 Video backgrounds    ← depends on 1.1, 1.2
         │
Phase 3: Shared UI
    ├── Task 3.1 Layout + Router      ← depends on 0.1, 1.5
    ├── Task 3.2 ChordDisplay         ← depends on 1.3, 1.4
    └── Task 3.3 TransposeControls    ← depends on 1.4
         │
Phase 4-8: Pages (can be parallelized)
    ├── Task 4.1 Song Editor          ← depends on 2.1, 3.2, 3.3
    ├── Task 4.2 Song Library         ← depends on 2.1, 3.2
    ├── Task 4.3 Song Detail          ← depends on 2.1, 3.2, 3.3
    ├── Task 5.1 Playlist List        ← depends on 2.2
    ├── Task 5.2 Playlist Detail      ← depends on 2.1, 2.2, 3.3
    ├── Task 6.1 Stage View           ← depends on 2.2, 3.2, 3.3
    ├── Task 7.1 PDF Export utility   ← depends on 1.4
    ├── Task 7.2 PDF Export page      ← depends on 7.1, 2.2
    ├── Task 8.1 BroadcastChannel     ← depends on 0.1
    ├── Task 8.2 Presenter Screen     ← depends on 8.1
    └── Task 8.3 Control Screen       ← depends on 8.1, 8.2, 2.2, 2.3
         │
Phase 9: Integration
    ├── Task 9.1 Wire routes          ← depends on all above
    ├── Task 9.2 Seed data            ← depends on 1.2
    └── Task 9.3 Build + deploy       ← depends on 9.1
```

## Parallel Execution Groups

**Group A (can run simultaneously):**
- Task 1.3 (Chord parser) + Task 1.4 (Transpose) — pure functions, no shared files

**Group B (after Phase 1):**
- Task 2.1 (Songs hooks) + Task 2.2 (Playlists hooks) + Task 2.3 (Video hooks) — different files

**Group C (after Phase 2+3):**
- Task 4.1 + 4.2 + 4.3 (Song pages) — shared types but different page files
- Task 5.1 + 5.2 (Playlist pages) — sequential (5.2 depends on shared components)
- Task 6.1 (Stage) + Task 7.1 (PDF) + Task 8.1 (Broadcast) — completely independent
