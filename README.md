# 🎵 WorshipTeam

**A real-time worship song management and live presentation platform** built for church worship teams. Manage songs with chord charts, organize setlists, transpose on the fly, and present lyrics with video backgrounds — all from a single app.

**Live Demo:** [klongchan-worship.vercel.app](https://klongchan-worship.vercel.app)

---
<img width="1293" height="835" alt="image" src="https://github.com/user-attachments/assets/898cffb8-7f58-47e8-a773-d06947c6f1fc" />


## ✨ Features

### Song Library
- **Chord chart parser** — paste raw chord+lyrics text (ChordPro or two-line format) and the app auto-parses into structured sections (verse, chorus, bridge)
- **Draggable chord alignment** — visually drag chord names to align them perfectly over lyrics, with positions saved to the database
- **Auto key detection** — detects the musical key from parsed chords
- **Transpose** — real-time transposition with ♯/♭ toggle

<img width="1255" height="825" alt="image" src="https://github.com/user-attachments/assets/75a5bf51-91c6-4dd3-8ce4-e5293f516cc1" />

### Playlist & Setlist Management
- Create playlists for worship services with date and notes
- **Drag-reorder songs** within a playlist (desktop) or use ↑↓ buttons (mobile)
- Per-song transpose setting saved per playlist

<img width="1287" height="751" alt="image" src="https://github.com/user-attachments/assets/b24849f2-acde-4888-90ab-c61ed30f5781" />


### Live Presentation (Dual-Screen)
- **BroadcastChannel API** — control panel and fullscreen presenter run in separate windows, communicating in real-time
- **Lyric block pagination** — auto-splits sections into 2–3 line blocks for readable projection
- **Video backgrounds** — play MP4 video loops behind lyrics from Supabase Storage
- **Welcome / Black screen** — quick toggles for service flow
- **PDF export** — generate chord charts as downloadable PDFs with preserved chord positions

<img width="1308" height="640" alt="image" src="https://github.com/user-attachments/assets/5e79c1eb-d317-408e-8bbb-1db63704c9cb" />


### Responsive Design
- Full mobile/tablet support with hamburger navigation and bottom tab bar
- Touch-friendly chord dragging with gesture disambiguation (scroll vs. drag)
- Adaptive layouts: stacked panels on mobile, side-by-side on desktop

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│         React 18 + TypeScript + Vite             │
│              Tailwind CSS v4                     │
│              Zustand (state)                     │
├─────────────────────────────────────────────────┤
│                 Backend (BaaS)                   │
│              Supabase (PostgreSQL)               │
│     ┌───────────┬──────────┬──────────────┐     │
│     │  songs     │ playlists│ video_       │     │
│     │  (JSONB)   │ + songs  │ backgrounds  │     │
│     │  sections  │  (M:N)   │ (Storage)    │     │
│     └───────────┴──────────┴──────────────┘     │
├─────────────────────────────────────────────────┤
│                Deployment                        │
│            Vercel (SPA + CDN)                    │
└─────────────────────────────────────────────────┘
```

### Key Technical Decisions
| Decision | Rationale |
|----------|-----------|
| **JSONB `sections` column** | Parsed chord structures stored directly in PostgreSQL — no re-parsing on load, preserves drag-adjusted chord positions |
| **Zustand stores** | Lightweight, no boilerplate. Separate stores for UI, song editor, and presentation state |
| **BroadcastChannel API** | Zero-latency window-to-window communication for presenter/control panel — no server needed |
| **Field whitelist pattern** | DB updates go through an explicit allowed-fields filter to prevent mass-assignment |
| **Row Level Security** | Open policies for trusted church community (no auth required) |
| **Supabase Storage** | Video backgrounds hosted alongside the database — single platform, no external CDN needed |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 18, TypeScript 6 |
| **Build** | Vite 8 |
| **Styling** | Tailwind CSS v4 |
| **State** | Zustand 5 |
| **Backend** | Supabase (PostgreSQL, Storage) |
| **PDF** | jsPDF + html2canvas |
| **Routing** | React Router v6 |
| **Deployment** | Vercel |

---

## 📁 Project Structure

```
src/
├── components/
│   ├── Layout.tsx              # App shell with responsive nav
│   ├── Sidebar.tsx             # Collapsible sidebar (desktop) / overlay (mobile)
│   ├── ChordDisplay.tsx        # Renders chord+lyric lines with transposition
│   ├── TransposeControls.tsx   # Key selector + transpose +/- buttons
│   └── SongSearchModal.tsx     # Search modal for adding songs to playlists
├── pages/
│   ├── SongLibrary.tsx         # Song list + detail (master-detail)
│   ├── SongEditor.tsx          # Create/edit songs with live preview + chord dragging
│   ├── SongDetail.tsx          # Read-only song view with transpose
│   ├── PlaylistList.tsx        # All playlists
│   ├── PlaylistDetail.tsx      # Playlist songs with reorder + transpose
│   ├── PresentationControl.tsx # Control panel for live presentation
│   ├── PresenterScreen.tsx     # Fullscreen lyrics display window
│   ├── StageView.tsx           # Full-song view with auto-scroll
│   └── PdfExport.tsx           # PDF generation page
├── hooks/
│   ├── useSongs.ts             # CRUD operations for songs
│   ├── usePlaylists.ts         # CRUD operations for playlists + playlist_songs
│   └── useVideoBackgrounds.ts  # Video background management
├── store/
│   ├── uiStore.ts              # Sidebar state
│   ├── songEditorStore.ts      # Editor state (raw text, parsed content, key)
│   └── presentationStore.ts    # Presentation state (song index, block, bg)
├── utils/
│   ├── chordParser.ts          # Parses raw chord+lyrics text → Section[]
│   ├── transpose.ts            # Musical key transposition logic
│   ├── pdfExport.ts            # PDF generation with chord positioning
│   └── presentationChannel.ts  # BroadcastChannel wrapper
├── lib/
│   └── supabase.ts             # Supabase client initialization
└── types/
    └── database.ts             # TypeScript interfaces for all DB tables
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project

### Setup

```bash
# Clone the repo
git clone https://github.com/FFFames/worship-team-app.git
cd worship-team-app

# Install dependencies
npm install

# Create .env.local with your Supabase credentials
echo "VITE_SUPABASE_URL=https://your-project.supabase.co" > .env.local
echo "VITE_SUPABASE_ANON_KEY=your-anon-key" >> .env.local

# Run the SQL migration (see supabase/migrations/)
# Then start the dev server
npm run dev
```

### Database Setup

Run the migrations in `supabase/migrations/` against your Supabase project using the SQL Editor. This creates:
- `songs` — with JSONB `sections` column
- `playlists` + `playlist_songs` — with ordering and per-song transpose
- `video_backgrounds` — for presentation backgrounds
- RLS policies, indexes, and auto-update triggers

---

## 📱 Screenshots

*Songs Library* | *Song Editor with Chord Dragging* | *Live Presentation*
:---:|:---:|:---:

---

## 📄 License

MIT
