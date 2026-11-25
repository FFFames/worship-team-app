# 🎵 WorshipTeam

**A real-time worship song management and live presentation platform** built for church worship teams. Manage songs with chord charts, organize setlists, transpose on the fly, and present lyrics with video backgrounds — all from a single app.



---
<img width="1293" height="835" alt="image" src="https://github.com/user-attachments/assets/898cffb8-7f58-47e8-a773-d06947c6f1fc" />


## ✨ Features

### Song Library
- **Chord chart parser** — paste raw chord+lyrics text (ChordPro, two-line format, Thai worship notation, or bar notation like `| G | Bm |`) and the app auto-parses into structured sections
- **Human-readable sections** — supports `Verse 1`, `Verse 2`, `Prehook`, `Hook`, `Bridge`, `Intro`, `Outro`, `End`, and `Instrumental`
- **Section alias normalization** — converts common inputs like `Pre-Chorus` → `Prehook`, `Chorus` → `Hook`, `Outtro` → `Outro`, `End/Ending` → `End`, and `Solo/Interlude` → `Instrumental`
- **Draggable chord alignment** — visually drag chord names to align them perfectly over lyrics, with positions saved to the database
- **Auto key detection** — detects the musical key from parsed chords
- **Transpose** — real-time transposition with ♯/♭ toggle
- **EasyWorship song import** — preview, select, and import songs from a 6.1/7 SQLite library, including Thai lyrics and CCLI metadata. See [migration instructions](#importing-an-easyworship-song-library).
- **Lyric search** — switch the song library search to lyrics to find songs by a phrase in the stored song text.

### AI Song Formatter
- **AI formatter sidebar** — available on Add/Edit Song for cleaning up pasted raw chord charts
- **Text + image input** — supports typed text, pasted screenshots, uploaded JPG/PNG files, and multiple images
- **OCR-first workflow** — runs browser OCR with `tesseract.js` first, then falls back to Groq Vision through a Supabase Edge Function
- **Apply-and-edit loop** — formatted output is applied directly into the raw editor, then users can type follow-up instructions such as “แก้ Hook บรรทัดแรกให้คอร์ดเป็น F G Em Am F”
- **Narrow scope** — the assistant only formats or edits chord/lyrics content and refuses unrelated requests

<img width="1255" height="825" alt="image" src="https://github.com/user-attachments/assets/75a5bf51-91c6-4dd3-8ce4-e5293f516cc1" />

### Playlist & Setlist Management
- Create playlists for worship services with date and notes
- **Drag-reorder songs** within a playlist (desktop) or use ↑↓ buttons (mobile)
- Per-song transpose setting saved per playlist
- **EasyWorship schedules** — preview and import ordered `.ewsx` cues, repeated songs, and slide text. Play supported packed image/video files from the browser that imported them. See [schedule import](#importing-an-easyworship-schedule).

<img width="1287" height="751" alt="Playlist management" src="https://github.com/user-attachments/assets/b24849f2-acde-4888-90ab-c61ed30f5781" />

### Scripture
- Import an unprotected EasyWorship SQLite format-1 `.ewb` edition into the browser's library.
- Search for a chapter, an individual verse, ranges within a book, or words in the text. Select only the verses to include.
- Preview one-verse or continuous slides, show them immediately in a scripture presenter window, or add them to a playlist with their references.

### Media Library

- Import a profile's image and video catalog from `Media.db` and its matching `Resources` files. [Media migration steps](#importing-an-easyworship-media-library)
- Add individual image, video, and audio files. Preview them in the library, send them to an audience window, or add them as playlist cues.
- Set an image or looping muted video as the background of an individual song or scripture occurrence.

### Presentations and Themes

- Import EasyWorship presentation layouts and themes with the matching media files. [Slide and theme migration steps](#importing-easyworship-presentations-and-themes)
- Import PowerPoint `.pptx` and legacy `.ppt` decks attached to schedules or profiles. Editable slides preserve the table contents and supported formatting. WorshipTeam Desktop uses LibreOffice Impress to open `.ppt` and render slides containing charts or other complex graphics. [PowerPoint migration steps](#importing-powerpoint)
- Create a presentation or theme, edit text layers and backgrounds, and set slide transitions, advance times or looping for announcements.
- Present a slide deck live or add it to a playlist. Apply a song or scripture theme to an individual playlist entry.

### Live Presentation (Dual-Screen)
- **BroadcastChannel API** — control panel and fullscreen presenter run in separate windows, communicating in real-time
- **Lyric reflow** — 1, 2, or 4 wrapped display lines per slide, or one stanza per slide. Choose a slide to send the new layout live.
- **Video backgrounds** — play MP4 video loops behind lyrics from Supabase Storage
- **Welcome / Clear / Black screen** — show the assigned logo or welcome image, clear foreground content while the background plays, or black out the screen.
- **Audience alerts** — show or clear a text banner alongside the presentation. Black hides the banner and the rest of the output.
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
│   ├── SongFormatterChatbot.tsx # AI chord/lyrics formatter sidebar
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
│   ├── useSongFormatter.ts     # OCR + Supabase Edge Function formatter client
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
supabase/
└── functions/
    └── format-song/            # Groq-powered chord/lyrics formatter
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 22.13+ on the 22 release line, or Node.js 24 LTS
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

### AI Song Formatter Setup

The Add/Edit Song page includes an AI sidebar that formats raw chord/lyrics text and printed chord-chart images. The Groq API key must be stored as a Supabase Edge Function secret, not as a browser `VITE_` variable.

```bash
supabase secrets set GROQ_API_KEY=your-groq-api-key
supabase functions deploy format-song
```

Browser OCR uses `tesseract.js` first. If OCR is unclear or unavailable, the Edge Function falls back to Groq Vision. Successful results are applied to the raw editor immediately and shown with a “กรุณาตรวจสอบ” warning.

### Database Setup

Run the migrations in `supabase/migrations/` against your Supabase project using the SQL Editor. This creates:
- `songs` — with JSONB `sections` column
- `playlists` + `playlist_songs` — with ordering and per-song transpose
- `video_backgrounds` — for presentation backgrounds
- RLS policies, indexes, and auto-update triggers

### Importing an EasyWorship song library

1. On an existing WorshipTeam database, apply the additive [song metadata migration](supabase/migrations/20261123022742_easyworship_song_metadata.sql) and [song appearance migration](supabase/migrations/20261123055400_imported_song_appearance.sql). Migration `002` recreates the core tables and is intended for fresh databases.
2. Close EasyWorship before copying the files. For SQLite profiles, copy `Songs.db` and `SongWords.db` from the same `Databases/Data` directory. WorshipTeam also accepts a SQLite `SongWords.dat`. For a legacy Paradox library, copy `Songs.DB` and `Songs.MB` from the same `Data` directory. You can also use a ZIP-compatible archive with the pair together. [EasyWorship profile guide](https://support.easyworship.com/support/solutions/articles/24000020412-profiles) · [EasyWorship 2007 and 2009 database guide](https://support.easyworship.com/support/solutions/articles/24000020416-force-easyworship-to-convert-the-2007-or-2009-database)

If the song catalog is missing, choose the SQLite `SongWords.db` or `SongWords.dat` by itself, or review a profile archive containing that file. Review the recovered lyrics and section order under temporary titles built from the source row number and first lyric line. When you find the matching `Songs.db`, import it with `SongWords` from the same EasyWorship catalog. WorshipTeam fills in the original title if the saved song still has its temporary title, adds missing catalog details, and keeps song IDs, playlist links, and local edits.

A newer copy of `SongWords` can still match an unchanged song through its original slide IDs and stored lyrics. Databases without unique native slide IDs require the original copy. If the recovery was saved with only a file checksum, re-import the original `SongWords` to register its native slide IDs. Recoveries saved before the app stored source identities need manual reconciliation.
3. In WorshipTeam, open **คลังเพลง → นำเข้า EasyWorship**. Choose **ฐานข้อมูลรุ่นเก่า** for the Paradox files or **ไฟล์บีบอัด** for an archive. Click **ตรวจรายการเพลง**. If several song libraries are listed, select a directory and check again. When a legacy library displays Thai text incorrectly, select **ไทย (Windows-874)** and check again.
4. Review the song sections, source notes, and any skipped rows. Uncheck songs you want to leave out, then click **นำเข้า**.

For a loose SQLite copy, choose the databases first, then add their matching logs in **ไฟล์บันทึก -wal**. This also works for standalone `SongWords.dat`, linked `PresentationLayouts.db`, and the optional `Media.db`. In an archive, keep each log beside its matching database. The song review reads committed changes and lists recovery messages under **ข้อสังเกตจากไฟล์ต้นฉบับ**. A damaged tail can be skipped after a complete commit. A song catalog whose log is damaged before the first complete commit cannot be reviewed. [SQLite write-ahead logs](https://www.sqlite.org/wal.html)

The browser reads the source files locally. After confirmation, it sends the selected song records to the existing Supabase library. Current library policies allow anonymous access. When a matching slide layout is unavailable, WorshipTeam reads authored colors, fonts, relative sizes, bold, italic, underline, outlines, shadows, alignment, and paragraph spacing from `SongWords`. Lyrics with automatic fonts inherit the selected theme. Re-import the same source to fill missing formatting on matching sections. Add `PresentationLayouts.db` or the full profile with its `Resources` folder to recover the layouts, backgrounds, and audio. The import result counts existing songs that received missing data. A change to the source title, author, copyright, CCLI, or lyrics creates a separate song on re-import. [EasyWorship song formatting](https://help.easyworship.com/EditaSong.html)

Native SQLite songs and songs recovered from an EasyWorship schedule can carry their copyright administrator, description, and tag text into the song library. Open a song and use **แก้ไข → ข้อมูลเพลงเพิ่มเติม** to edit these fields, copyright, or CCLI. Imported tag lines stay intact, including punctuation within a line. Re-importing an existing song fills missing fields and keeps saved edits and fields you cleared in the editor. [EasyWorship song information](https://help.easyworship.com/EditaSong.html)

For SQLite songs with saved layouts, include the matching `PresentationLayouts.db`. If slide identifiers are missing or incomplete, WorshipTeam can recover layouts and slide labels from matching lyrics within the linked layout. Distinct labels can identify repeats with the same words. The review reports unresolved layouts and keeps their lyrics in source order.

When choosing loose databases, add the matching **Media.db สำหรับเทียบไฟล์สื่อ (ถ้ามี)** to recover catalog checksums and the audio usage recorded by EasyWorship. Use **แนบไฟล์สื่อต้นฉบับของเลย์เอาต์ (ถ้ามี)** to attach original images, videos, and audio. The song review uses the saved SHA-256 to verify those files and can reuse matching files from this browser's media library. A checksum match can recover a renamed original even when the layout's recorded file size is outdated. The song-only archive option also checks the browser library and the selected profile's `Resources` folder. Import the same source again to fill missing files on existing songs.

The legacy reader restores supported backgrounds and text settings enabled for individual songs. Select **นำเสนอเพลงจากคลัง** on a song's detail page to preview and open the audience window. In a playlist, choose **ทั้งท่อน** to display each imported section together.

Imported songs use lyrics-only editing. Start a new section with `[Section name]` where `name` is the label. Use the schedule importer below for `.ewsx` files and their packed media. See [EasyWorship compatibility](docs/easyworship-compatibility.md) for tested formats and feature gaps.

### Migrating an EasyWorship profile

Apply the EasyWorship migrations in `supabase/migrations` in order before using the profile importer against an existing WorshipTeam database.

1. Close EasyWorship before copying a profile or making a backup with its Profile Transfer Tool. Keep the profile's data directory and `Resources` together. On Windows, a profile can have its databases under `v6.1/Databases/Data` with `Resources` beside `v6.1`. You can select the profile directory or a ZIP-compatible `.ewprofile`, `.ewpck`, or `.zip` that contains it. [EasyWorship Profile Transfer guide](https://support.easyworship.com/support/solutions/articles/24000043114-transfer-easyworship-profile) · [EasyWorship Windows profile paths](https://support.easyworship.com/support/solutions/articles/24000041544-jpeg-error-53-when-accessing-media)
2. In WorshipTeam, open **คลังเพลง → ย้ายโปรไฟล์ EasyWorship**. Click **ตรวจโปรไฟล์** and pick one profile if the archive contains several. Review and select songs, media, presentations, themes, PowerPoint files, Bible editions, and schedules.

Use **แนบตารางนมัสการ .ews หรือ .ewsx** for schedules saved outside the profile. Select several files and click **ตรวจโปรไฟล์**. The review and CSV identify the attached schedules. Import them with the selected profile so WorshipTeam can link songs and presentations, use its Bible editions, and recover media from its Resources. Each schedule has its own result. Re-importing the same file also works if it has since been included in the profile archive. [EasyWorship schedule guide](https://help.easyworship.com/SavingTransferringASchedule1.html)

Use **แนบงานนำเสนอ .ewpx หรือธีม .ewtx** in the same review for separately exported designs. WorshipTeam uses packed media when its SHA-256 matches a reference in a layout, the media catalog, or a schedule. The review combines designs with the same native ID, compatible revision, and matching slide IDs. For an older layout without a checksum, it can recover a verified file from a matching frame of that same design. A known different revision remains selectable on its own. [EasyWorship theme media transfer](https://support.easyworship.com/support/solutions/articles/6000128146-themes-not-transferring-the-media-over)

To recover an older EasyWorship catalog, select or zip the whole profile with its `Databases/Archive` directory and `Resources` folder. Choose the dated **ฐานข้อมูลย้อนหลัง** entry and review it. Each dated backup keeps its own database pairs. The importer checks the current `Resources` against the size and SHA-256 stored in the archived `Media.db` when available. You can attach the original media if the matching file was moved outside the profile. Open the current profile entry for its schedules and output settings. [EasyWorship database archive guide](https://support.easyworship.com/support/solutions/articles/6000089864-restore-easyworship-database-from-archive)

When `Presentations.db` records a PowerPoint checksum, the review matches it against the original deck in `Resources` or a file you attach. Renamed decks and different revisions with the same filename can be recovered by their checksums. A missing match appears in the review so you can attach the original file. Import a manually converted `.pptx` from the slide library when the catalog checksum describes the original `.ppt`. [EasyWorship PowerPoint workflow](https://help.easyworship.com/EditingScheduleItems1.html)

When a native layout records a media checksum, the review matches its images, videos, and audio in `Resources`, in attached originals, or in the browser’s WorshipTeam media library. The checksum identifies the file even after a rename and keeps different files with the same name separate. Re-importing can fill the existing layer and keep local edits. An earlier import can be matched when its native layout and media references still correspond to the source. Local title and slide-label edits are preserved during that match. [EasyWorship presentation layouts](https://help.easyworship.com/EditingPresentations.html)

3. Click **นำเข้ารายการที่เลือก**. The report shows each category's outcome. You can retry the same selection if part of the import fails. Identical records reuse existing IDs, so retrying preserves prior imports and edits.

Use **ดาวน์โหลดรายการตรวจโปรไฟล์ CSV** before importing and **ดาวน์โหลดผลการนำเข้า CSV** afterward. The reports list each reviewed item, its source reference, its import status, its destination ID where available, and any warnings or errors. The results distinguish a saved song with incomplete details from a song the importer has yet to reach. After the [schedule import result migration](supabase/migrations/20261123220642_easyworship_schedule_import_result.sql), the report distinguishes a newly created schedule from one reused by the import. The earlier database API reports **ยืนยันว่ามีในปลายทาง** when it confirms the destination ID. The CSV stays in your browser until you download it.

The profile importer discovers both SQLite and legacy Paradox song pairs. It uses files from the selected profile to restore images, videos, and PowerPoint decks referenced by its schedules when they are missing from the packed `.ewsx`. Supported files under the profile's Images, Videos, and Audio directories are selectable even if they have no catalog entry. Songs, designs, and playlists use the existing Supabase libraries. Media files, complete Bible editions, song activity, and imported collections are stored in the browser. Repeat the profile import on another browser to restore its local resources. [Tested EasyWorship data formats](docs/easyworship-compatibility.md)

When `Media.db` has a SHA-256 value, WorshipTeam checks the contents of a file even if its name and size agree with the catalog. The review identifies conflicting files and searches the selected profile, attachments, and media already stored in this browser for the original bytes. Re-import with a matching copy to repair missing media in saved layouts and schedules. A layout or schedule with its own checksum uses the file that matches that reference.

If a copied SQLite profile contains a `-wal` file, keep it next to its original database in the folder or archive. The profile review reads committed pages from the matching files and shows any recovery notes under **ผลตรวจโปรไฟล์**. If the log is damaged after a complete commit, the review reports the point through which it could recover data. Close EasyWorship before making a fresh copy. [SQLite write-ahead logs](https://www.sqlite.org/wal.html)

Archives from EasyWorship Profile Transfer display the exported profile name and EasyWorship version. For an export with missing or damaged media, review the archive first, then choose the original `Resources` directory under **แนบโฟลเดอร์ Resources จากโปรไฟล์นี้** and click **ตรวจโปรไฟล์** again. Browse for the `Resources` directory itself. If a media file or PowerPoint deck shares its path with a copy in the archive, a saved SHA-256 can recover the matching copy from the attached folder. References without a saved checksum use the archive copy at that path. [EasyWorship Profile Transfer guide](https://support.easyworship.com/support/solutions/articles/24000043114-transfer-easyworship-profile)

If the Bible plug-ins are separate from the profile, select **แนบฉบับพระคัมภีร์ .ewb** after choosing the profile and review again. The preview shows the edition name and its EasyWorship translation ID. Select the editions with their schedules. The importer installs supported editions before restoring missing verse text and keeps any installed edition with the same ID. [EasyWorship Bible installations](https://support.easyworship.com/support/solutions/articles/24000020384-purchasing-installing-bibles)

For media referenced on another drive or network share, choose the original files under **แนบไฟล์สื่อหรือ PowerPoint ต้นฉบับ** after the first review, then click **ตรวจโปรไฟล์** again. The review shows the original path for external catalog entries. This field also accepts media for a profile that has schedules without a Media.db catalog. [EasyWorship Windows profile paths](https://support.easyworship.com/support/solutions/articles/24000041544-jpeg-error-53-when-accessing-media)

Use **แนบโฟลเดอร์สื่อต้นฉบับภายนอก** when a backup drive or network share contains several files with the same name. Keep the original subfolders. Without a saved checksum, the importer uses the longest matching part of the original path, including at least one directory and the filename, and checks the size when available. Tied paths and mismatched files remain unresolved for review. Native SQLite slides and schedules that retain their original absolute links can use the same folder.

When a `.ewsx` schedule contains a saved SHA-256 value, the profile importer checks the original file contents. It can find a renamed file in `Resources`, among selected external attachments, or in the existing WorshipTeam media library on this browser. It assigns different versions of a same-name file to the correct cues. If the original is still missing, the report identifies the unresolved reference. Review the profile again with the remaining originals to fill the existing entries.

The profile attachment picker accepts `.pptx` and `.ppt` files referenced by its schedules. For `.ewsx` PowerPoint references with a saved SHA-256 value, both import screens check the packed or external deck and can find the exact original under a new name. When a schedule was saved without packing its deck and refers to it by name, profile import uses a unique SHA-256 from `Presentations.db` when available. The import report lists a conflict if the catalog identifies several versions under the same name. For a `.ppt` reference with a unique source name, you can also attach a converted `.pptx` with the same base name. [EasyWorship schedule packing](https://help.easyworship.com/SavingTransferringASchedule.html)

For large profiles, use a regular browser profile with space for both the restored media and the temporary file being processed. WorshipTeam verifies media stored without compression directly from the source archive. Browsers that support private disk storage use it for large compressed schedules and for media being verified or copied into the library, slide layouts, or schedule attachments. WorshipTeam removes each temporary file after the read or write finishes, including when an import step reports an error. [Chrome private file storage](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)

**ชุดตัวเลือก EasyWorship** starts with the set named by the exported `.ewp` profile. When there is no named set, a single available set is selected automatically. The set supplies default output themes, Scripture display settings, alert templates, and service intervals. Choose another set and review again to import its settings. When there is no clear match, the review starts with **เฉพาะคลังและตาราง**. [EasyWorship profiles](https://support.easyworship.com/support/solutions/articles/24000020412-profiles)

### Migrating EasyWorship output settings

EasyWorship 7 for Windows stores the computer's output settings in `%ProgramData%\Softouch\EasyWorship.v7\Settings\ComputerSettings.ini`. Copy that file separately from the profile backup. From the profile import page, open **ย้ายค่าจอ**, choose the file, and review the audience, Foldback and Alternate margins and the Alternate background and foreground flags. Click **บันทึกค่าจอ** to use the values in the current browser. Open output windows update immediately. [EasyWorship settings file locations](https://easyworship.com/blog/common-easyworship-files-you-want-to-know-about) · [EasyWorship profile settings](https://help.easyworship.com/AboutProfiles.html) · [EasyWorship Alternate layer flags](https://support.easyworship.com/support/solutions/articles/24000080372-changing-background-foreground-properties-for-alternate-output)

In the selected profile option set, expand **การแสดงข้อพระคัมภีร์** and select the audience or broadcast settings to import. The importer reads reference placement, visibility, indentation and spacing, whether to abbreviate book names, complete-passage references, verse-number visibility, and the saved font size, family, color and character effects from `Live.Settings.db` and `Alt.Settings.db`. A display with settings saved in WorshipTeam keeps those settings. [EasyWorship Main Scripture](https://help.easyworship.com/MainScripture.html) · [EasyWorship Alternate Scripture](https://help.easyworship.com/AlternateScripture.html)

Use **คลังสื่อ → ย้ายคลังสื่อไปอีกเครื่อง** to carry the saved margins and Alternate layer flags in `.wtlibrary`. The restore preview lists each group. Restoring applies groups that have no saved setup on the destination and updates its open outputs. Physical display placements and the Alpha Key Fill source follow the destination's settings.

### Selecting monitors for live outputs

Connect the displays in extended desktop mode on the presentation computer. In **ตั้งค่าจอ**, click **ค้นหาจอที่เชื่อมต่อ** and allow the site's Window management permission in Chrome or a Chromium browser that supports it. Choose a display for **จอผู้ชม**, **จอเวที**, and **จอถ่ายทอดสด**, then click **บันทึกค่าจอ**. The selection is saved in the current browser and applied when an output opens. Click the output window to focus it and press **F** to enter or exit fullscreen. If your browser or operating system opens the window in its usual position, drag it to the desired display. The browser's fullscreen control is also available. [Chrome Window Management](https://developer.chrome.com/docs/capabilities/web-apis/window-management) · [EasyWorship Screen Setup](https://support.easyworship.com/support/solutions/articles/24000020382-screen-setup)

### Previewing a cue before going live

In the presentation controls, enable **ดูตัวอย่างก่อนขึ้นจอ** in **รายการนำเสนอ**. Select a cue, choose its starting slide under **ตัวอย่างก่อนขึ้นจอ**, then click **ขึ้นจอ**. The Left and Right arrows step through the staged slides in the standard view. The live slide grid and connected controllers operate the current output. Live timers keep running while you choose the next cue. Local videos in the preview are muted and paused. Turn off the checkbox for immediate cue selection. The browser remembers your choice. [EasyWorship preview and live workflow](https://help.easyworship.com/MainSectionsoftheInterface.html)

### Moving through the entire live schedule

Enable **เลื่อนต่อเนื่องทั้งเพลย์ลิสต์** above the live slide list to see the slides grouped in schedule order. Use Left and Right or the previous and next buttons to step through the live schedule and PowerPoint builds in either direction. You can also select a specific slide. The staged preview stays ready while you move through the live schedule. Slide timers keep their own cue's settings. The browser remembers the mode. [EasyWorship Contiguous Schedule View](https://help.easyworship.com/AddingItemstotheSchedule.html)

### Printing a song list

In **คลังเพลง**, select **พิมพ์รายชื่อเพลง** to preview the titles and authors that match the current search and collection. The report sorts by title unless you have chosen a library sort. Select **รวมข้อมูลลิขสิทธิ์และ CCLI** to include available credits, then print or save to PDF from the browser. [EasyWorship song list reporting](https://support.easyworship.com/support/solutions/articles/24000020414-songs-printing-reporting)

### Printing a service schedule

Open a playlist and select **พิมพ์ตาราง**. **แบบสรุป** lists the cues and their types in order. **แบบละเอียด** starts each cue on a new page and includes saved lyrics or slide text, available author and copyright details, reference numbers, and media filenames. In the browser print dialog, choose a printer or save as PDF. **ส่งออก PDF** on the playlist page remains the chord chart export. [EasyWorship schedule reports](https://support.easyworship.com/support/solutions/articles/24000020414-songs-printing-reporting)

### Running the live stage display

From the presentation controls, click **เปิดจอเวทีสด**. **เต็มจอ** fills the selected monitor. The stage follows the current playlist slide, shows the time, and previews up to two lines of the next slide or the title of the next item. The controller can change or hide the preview and use **ข้อความถึงทีมบนเวที** for stage-only messages. **Black**, **Clear**, and **Welcome** update the audience display while the stage keeps its current cue. The stage can show standalone cameras and positioned camera layers, including imported EasyWorship Feed cues after assigning a local camera or a Desktop NDI source. Stage video is silent. Songs and Scripture use the configured stage text layout. The playlist's chord view remains available from the playlist page. [EasyWorship Foldback workflow](https://support.easyworship.com/support/solutions/articles/24000020394-display-foldback-stage-display-)

Speaker notes and EasyWorship schedule item notes appear in the controller's cue preview and on the live stage display. Use **โน้ตผู้บรรยาย** in the slide or playlist editor for slide-specific notes and **บันทึกสำหรับรายการนี้** for a note across the whole item. [EasyWorship schedule item notes](https://support.easyworship.com/support/solutions/articles/24000018839)

In **ตั้งค่าจอ → รายการถัดไปและนาฬิกาบนจอเวที**, save a default preview line count and choose the clock format, position, and appearance. The controller's line-count choice applies to the current session. When migrating an EasyWorship profile, select the source options set and review **ตัวอย่างถัดไปและนาฬิกาบนจอเวที**. It reads the settings in that set's `Foldback.Settings.db`. Import fills the stage appearance when it has not already been saved in this browser. A `.wtlibrary` backup also carries these settings. [EasyWorship Foldback General](https://help.easyworship.com/FoldbackGeneral.html) · [EasyWorship Foldback Alerts and Clocks](https://help.easyworship.com/FoldbackAlertsandClocks.html)

The **เวลานับถอยหลังบนจอเวที** option migrates the display settings from `Foldback.Settings.db` and the weekly times from `ServiceIntervals.db` in the selected options set. In **ตั้งค่าจอ**, edit the weekly times or copy them from an imported catalog. The countdown uses local time and follows the nearest service start or end. The optional overrun shows negative time until the timer switches targets. Repeat imports fill missing times or appearance while preserving saved edits. A `.wtlibrary` backup carries both the display and the weekly times. [EasyWorship service intervals](https://help.easyworship.com/ServiceIntervals.html) · [Foldback countdown options](https://help.easyworship.com/FoldbackAlertsandClocks.html)

**รูปแบบข้อความหลักบนจอเวที** imports separate song and Scripture defaults from `Foldback.Settings.db`. Review and edit the font, colors, effects, margins, alignment, wrapping and capitalization in **ตั้งค่าจอ**. The fit option can keep one font size across the slides in the current playlist item. You can import the two defaults separately. A repeat import fills a missing default while preserving its saved counterpart, and `.wtlibrary` carries both defaults to another browser. [EasyWorship Foldback General](https://help.easyworship.com/FoldbackGeneral.html)

### Pairing a mobile remote

Open the playlist's presentation controls, expand **รีโมตมือถือ**, and select **เปิดการจับคู่**. Scan the QR code on a phone or open the copied link. Compare the six-digit code on both screens, then choose **ให้ดูสไลด์** or **ให้ควบคุมสไลด์** for that device. The phone shows the current slide and schedule. Control mode can jump to a cue or slide, step between items, and black out or restore the audience display. [EasyWorship Remote App](https://support.easyworship.com/support/solutions/articles/24000028054-using-the-easyworship-remote-app)

Choose **จับคู่อุปกรณ์เพิ่ม** to invite the next phone or tablet. Up to eight devices can stay connected, each with its own invitation and permissions. Use **ให้ดูสไลด์** to withdraw control, **เลิกจับคู่อุปกรณ์** to disconnect that device, or **ปิดรีโมต** to end all connections. A phone whose page reloads needs a new invitation. Use the six-digit code to identify the old device in the list before removing it.

Each device needs internet access and the same HTTPS WorshipTeam deployment, backed by a Supabase project that permits Realtime public broadcasts. Each invitation opens a separate channel that relays encrypted packets. [Supabase Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast) · [Realtime settings](https://supabase.com/docs/guides/realtime/settings)

### Migrating keyboard shortcuts

In **ย้ายโปรไฟล์ EasyWorship** or the presentation controls, open **ปุ่มลัดนำเสนอ**. Select `HotKeys.2.ini` or `HotKeys.ini` from the old EasyWorship computer's `Settings` folder, review the bindings, and choose **ใช้ปุ่มลัดชุดนี้**. The settings apply in the controls and in the audience window opened from them. The official Profile Transfer test export stores the catalogs in the profile archive and keeps the shortcut file in the computer's Settings folder. [EasyWorship remote and hotkey setup](https://support.easyworship.com/support/solutions/articles/8605-using-a-presenter-remote)

The imported shortcuts can prepare the next or previous playlist item, go live, move among slides, and toggle Black, Welcome, and Clear. Type a slide number and press **Enter**, or type a section key such as **V** or **C**, its number, and **Enter**. The review lists unmapped or conflicting keys, including EasyWorship's disabled `GoLivePrevKeys` field. A browser can reserve a shortcut such as **Ctrl+L** for its own controls. Use **คืนปุ่มลัด WorshipTeam** to restore the built-in shortcuts. [EasyWorship keyboard commands](https://support.easyworship.com/support/solutions/articles/24000020383-shortcut-keys)

Export `.wtlibrary` from **คลังสื่อ → ย้ายคลังสื่อไปอีกเครื่อง** to transfer the saved keyboard profile and active MIDI input and output configurations. The review shows each available control configuration. Restore preserves the destination's saved control choices and its MIDI ports. Enable MIDI input or output on the destination when ready.

### Controlling a presentation with MIDI

Open **ควบคุมด้วย MIDI** in the playlist's presentation controls. Copy `MIDIControls.7.db` from the EasyWorship computer's `Settings` directory to migrate input and output note mappings, their channels, and the schedule and blackout/logo/clear output groups. Select the file, review each set, and apply the input or output configuration separately. Connect MIDI in a browser with Web MIDI support on HTTPS, select the device on this computer, and enable input. The mapping is saved in the current browser. Enable input again when you reopen the presentation. [EasyWorship MIDI Control](https://help.easyworship.com/MidiControl.html) · [Chrome MIDI permission](https://developer.chrome.com/blog/web-midi-permission-prompt)

Use **จับคู่คำสั่ง** to learn a note or a Control Change button. CC commands trigger when the control rises to 64 or higher and rearm below 64. Schedule selection queues the item. The separate Go Live or Slide No. binding sends it to the audience. For Schedule No. and Slide No., Note On velocity starts at 1. Select an input available through the operating system. You can also load the default EasyWorship input notes. [EasyWorship MIDI cue examples](https://support.easyworship.com/support/solutions/articles/24000055129-running-two-easyworship-computers-with-one-midi-controller)

To mirror slides to a second computer, open **ส่ง MIDI ไปยังเครื่องอื่น** on the primary. Select a MIDI destination, set the same channel used on the second computer, and apply the imported output mapping or the preset matching the default EasyWorship input. Enable output when ready. **ส่งสถานะจอปัจจุบัน** sends the displayed slide or screen mode immediately. Subsequent live changes send the schedule and slide numbers and the configured screen modes. Velocity can select schedule items and slides 1–127.

On the second WorshipTeam computer, open the same playlist with the same cue order and lyric layout. Select the matching MIDI input, enable it, and choose **รอสไลด์จากเครื่องหลักเมื่อขึ้นสไลด์ผ่าน MIDI** so a slide received from the primary waits for the next MIDI cue. Leave output disabled on the second computer. Incoming MIDI events are forwarded only if **ส่งต่อการเปลี่ยนแปลงจาก MIDI ขาเข้า** is enabled on the sending computer. Use separate input and output ports when forwarding an external controller. Output starts disabled each time the presentation opens and disconnecting a device also disables it. Media play and pause use their own optional note group. Each computer plays its own media and tracks its own playback time.

### Running a separate broadcast display

In the presentation controls, click **เปิดจอถ่ายทอดสด**. This window follows the current playlist cue and has its own **พักภาพจอถ่ายทอดสด** control. Welcome also shows the broadcast logo when one is assigned. Change the broadcast margins or how the window follows audience background overrides and attached foreground media under **ตั้งค่าจอ**. Original slide designs and standalone video cues remain available when those overrides are disabled. [EasyWorship Alternate output](https://help.easyworship.com/AlternateGeneral.html)

For window capture, select **WorshipTeam · จอถ่ายทอดสด** in your capture application. The window sends picture with muted local media. Mix broadcast audio separately. [OBS Window Capture on Windows](https://obsproject.com/kb/window-capture-sources) · [OBS Screen Capture on macOS](https://obsproject.com/kb/macos-screen-capture-source)

### Clearing the audience foreground

Press **Clear** to hide audience text and foreground media while the slide background keeps playing. Press **Clear** again or send a mapped MIDI Clear Off command to show the same slide and resume paused foreground video and audio. The broadcast and stage keep their current cue. EasyWorship imports preserve foreground and background roles, including fullscreen foreground video. Re-import the original `.ewsx` to recover these roles on existing imported cues. The roles travel in `.wtschedule` and `.wtlibrary` packages. [EasyWorship Clear button](https://help.easyworship.com/PresentingASchedule1.html)

### Migrating default output themes

In **ย้ายโปรไฟล์ EasyWorship**, review **ธีมเริ่มต้นของจอ**. The importer reads song, Scripture and presentation layouts from `Options/<name>.ewo/Data/Live.Settings.db` and `Alt.Settings.db` within the profile. When the same output and content type appear in two options sets, select the one you use. Include the original `Resources` folder so the importer can recover backgrounds referenced by those layouts. Imported defaults are stored in the current browser. Importing again preserves slots you already set or cleared. [EasyWorship default themes](https://help.easyworship.com/AddingandSettingDefaultBackgroun.html)

To use the same defaults in another browser, export a `.wtlibrary` from **คลังสื่อ → ย้ายคลังสื่อไปอีกเครื่อง**. The package keeps the output assignments, their layouts, and available local media. The review lists the saved slots and names any referenced files absent from the package. Restoring fills open slots and keeps choices or resets already saved on the destination.

The same settings files can contain separate logo assignments for the audience and broadcast outputs. The profile review resolves a logo's catalog reference to its original image, video, or native presentation. In **ธีมเริ่มต้นของจอ → โลโก้พักจอ**, choose a library resource or use the default. **Welcome** displays the assigned logo. Press it again to return to the current slide. Timed slides in a logo presentation play in their saved order. Logo assignments and their local assets travel in `.wtlibrary`. [EasyWorship Logo button](https://help.easyworship.com/PresentingASchedule1.html)

Use **ธีมเริ่มต้นของจอ** in the presentation controls to view the defaults or choose themes from the WorshipTeam library. A song or Scripture with its own saved design keeps that design on the audience display. The broadcast can use separate song and Scripture themes. Imported presentations with native layout fields place their title, subtitle, body and Scripture text in the matching broadcast template. Choose **ใช้ค่าปกติ** for the broadcast presentation setting to display the audience layout there as well. Slides saved without native layout fields can still use the default backdrop. [EasyWorship Alternate output themes](https://help.easyworship.com/AddingandSettingDefaultBackgroun.html) · [EasyWorship presentation layouts](https://help.easyworship.com/EditingPresentations.html)

The audience and broadcast use the transition saved with their matching theme slide. To edit a library theme, open **สไลด์ → แก้ไขสไลด์ → เอฟเฟ็กต์เปลี่ยนสไลด์**. The library updates any default slot using that theme in the current browser. In a playlist item, choose **ตามธีมที่ใช้** to inherit the effect, or **ตัดทันที** to switch immediately on both displays. An effect picked on a slide also applies to both displays. `.wtlibrary` carries the output defaults, and portable playlist and library backups carry the theme applied to an occurrence. [EasyWorship slide and theme transitions](https://support.easyworship.com/support/discussions/topics/24000024312?sort=popularity)

### Sending Alpha Key and Fill to a video mixer

In **ตั้งค่าจอ**, choose **จอผู้ชม** or **จอถ่ายทอดสด** under **แหล่งภาพ Fill**. Assign that output and **จอ Alpha Key** to separate display outputs. Match their resolution, refresh rate, and display scaling. Open the two windows from the presentation controller and press **F** in each. When changing the Fill source, reopen the Key window from that controller. Use **Space** in the audience Fill window if the browser requires an audio playback gesture.

Connect Fill and Key to separate mixer inputs. Set the mixer to external linear keying with a premultiplied Fill. The Fill is composited over black. The Key uses white for opaque pixels, black for transparent pixels, and gray for partial coverage. An opaque black design layer therefore remains visible on the program. For lyrics over a live camera, use a theme with a transparent background and bring the camera into the mixer. [EasyWorship Alpha Channel setup](https://support.easyworship.com/support/solutions/articles/24000020410-alpha-channel-setup) · [ATEM keying manual](https://documents.blackmagicdesign.com/UserManuals/ATEM_Mini_Manual.pdf)

Paired outputs use cuts for slide changes. The Key window is silent. Both windows render in Chrome, with independent media decoding and display timing. Validate physical capture levels and timing on the mixer, particularly for moving transparent graphics.

### Sending a live output over NDI

The desktop app can send the audience, broadcast, and stage views at the same time using NDI High Bandwidth. Set each view to 720p30 or 1080p30. Audience and broadcast send straight alpha for transparent themes and media. They use cuts for slide changes. Stage sends its usual opaque screen with the clock and operator alerts.

Install the [NDI 6 SDK](https://ndi.video/for-developers/ndi-sdk/download/) and its runtime on the presentation computer. Use Node.js 22.12 or newer and a C++17 compiler to build the sender and receiver. Start the web app with `npm run dev` in another terminal, or use your deployed WorshipTeam HTTPS URL.

```sh
npm ci --prefix desktop
npm --prefix desktop run build:ndi
npm --prefix desktop start -- --url http://localhost:5173
```

Set `NDI_SDK_INCLUDE` if the headers are outside the default macOS SDK directory, and `CXX` to use a compiler other than `clang++`. For a custom runtime installation, set `NDI_RUNTIME_DIR_V6` to the directory containing the runtime. The desktop app has its own browser storage. Import the profile or portable schedule into it to restore local media before a service.

Open the playlist's presentation controls and expand **ส่งภาพผ่าน NDI**. Choose the resolution and **เริ่มส่ง NDI** on each view you need. Select **WorshipTeam Audience**, **WorshipTeam Broadcast**, or **WorshipTeam Stage** in the receiver. **หยุดส่ง NDI** stops the selected stream, and leaving the presentation controls stops all three. The desktop app remembers each view's resolution and audio preference for the next start. Set `WORSHIP_NDI_GROUPS` before starting the desktop app to assign its streams to receiver groups. [EasyWorship NDI setup](https://support.easyworship.com/support/solutions/articles/24000020413) · [NDI receiver documentation](https://docs.ndi.video/all/developing-with-ndi/sdk/ndi-recv)

For audience or broadcast, select **ส่งเสียงจากคิว** before starting to include the cue audio as 48 kHz stereo. Cue mute and pause affect the NDI audio. **Black** silences the audience, and **พักภาพจอถ่ายทอดสด** silences the broadcast while it is paused. The hidden NDI view captures its own audio mix, and system audio stays outside the stream. [NDI audio frame and level reference](https://docs.ndi.video/all/developing-with-ndi/sdk/frame-types)

### Receiving an NDI video feed

Open **คลังสื่อ → สัญญาณสด** to make a reusable camera or NDI entry. **ย้ายโปรไฟล์ EasyWorship** reads saved Feeds from the profile's `Media.db`, including Feeds that are absent from the schedules. You can also select `Media.db` in **ย้ายคลังสื่อ EasyWorship**. Imported Feeds keep their titles, original device names and media collection memberships when the profile includes `Collections.db`. Re-importing a Feed preserves its local display name.

In WorshipTeam Desktop, choose **ค้นหาแหล่ง NDI**, select a source, and choose **ใช้แหล่ง NDI นี้**. Do this from the Feed library or the presentation controls. You can send a saved Feed to the audience, add it to a playlist, or choose it as the background in a playlist item's slide editor. The same Feed assignment is reused across the library and its playlist references on the presentation computer. Slides can display several positioned NDI feeds at once, with one receiver per source shared across the open outputs. The receiver uses the desktop app's NDI discovery group.

Select **รับเสียงจากแหล่ง NDI** and set **ระดับเสียง NDI** before applying the assignment to hear the Feed. A saved EasyWorship Feed provides its original mute and volume values when you first assign an NDI source. The audience can play the incoming audio locally, and an NDI output with **ส่งเสียงจากคิว** can also carry it. The receiver uses the first two audio channels, with mono repeated on both channels.

For a local camera or capture card, choose **ไมโครโฟนบนเครื่องนี้** to pair a microphone, mixer, or capture-card audio input with the picture. **ดูรายชื่อไมโครโฟน** requests browser permission and lists available devices. Imported Feeds show the original audio device name and offer the saved volume. Select **ใช้กล้องนี้** to save the assignment on this computer. Select **ปิดเสียง** or **เปิดเสียง** while the Feed is live to control audience audio. If the browser asks for playback permission, use **เปิดเสียงไมโครโฟน** on the audience display. [EasyWorship Feed controls](https://support.easyworship.com/support/solutions/articles/24000020396-feeds)

A Feed imported from `Media.db` shows its saved video settings under **ข้อมูลจาก EasyWorship**. WorshipTeam requests the saved resolution and frame rate as preferences so the browser can choose a supported camera format. Explicit Maintain, Stretch, and Zoom modes also apply to NDI framing. The settings travel with the Feed in `.wtlibrary` and its playlist occurrences in `.wtschedule`. Assign the local camera or NDI source on the destination computer. [EasyWorship Feed controls](https://support.easyworship.com/support/solutions/articles/24000020396-feeds) · [Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/)

A schedule import keeps the EasyWorship Feed title and any saved input names to guide the assignment. When the original name matches a discovered source, the selector offers it for confirmation. Re-import the same `.ewsx` to fill missing video settings on matching Feed occurrences in the existing playlist. If several computer assignments in the source disagree on a capture preference, WorshipTeam leaves that preference up to the destination camera. Re-importing an older schedule with additional saved input names creates a new reviewed copy. [EasyWorship NDI feeds](https://support.easyworship.com/support/solutions/articles/24000020413-ndi-setup)

Feed frames in native layouts retain their position, size, opacity, and layer order. Use **สัญญาณสดในสไลด์** to assign a camera or NDI input before sending the slide live. The slide editor can add a Feed from the local catalog, resize its frame, and move it in front of or behind other layers. Re-import the same `.ewsx` to restore the frame to a matching earlier schedule occurrence. Both backup formats carry the frame settings. Assign the local input on the destination computer. [EasyWorship Theme Editor](https://help.easyworship.com/ThemeEditor.html)

When a Feed comes from an EasyWorship master, import resolves it for each linked slide. A slide's saved position, visibility and replacement media take precedence. Switching between slides that use the same inherited Feed can keep the camera running while the frame changes. Open the same profile or `.ewsx` again to recover missing inherited frames where the existing layer order still matches the source. [EasyWorship master slide settings](https://help.easyworship.com/PresentationBackgrounds.html)

Linked slides also receive solid colors, gradients, images, and videos set as master backgrounds. A slide's own replacement or hidden setting takes precedence. When a background file is missing, re-import the same profile with its original `Resources` files, or attach the original media in the `.ewsx` review and import again. Compatible existing slides keep their saved text and schedule notes. [EasyWorship master backgrounds](https://help.easyworship.com/PresentationBackgrounds.html)

### Finding resources in imported EasyWorship collections

Select **กลุ่มจาก EasyWorship** with the songs in the EasyWorship profile review. Open **คลังเพลง** and use **กลุ่มเพลง** to filter the library. A folder shows songs from its descendant collections. Supported automatic rules use the current title, artist, copyright, copyright administrator, or lyrics. Manually included and excluded songs keep their links when renamed. Groups with unsupported rules or missing manual links use the saved membership. If a group imported with an earlier version has manual links, import the original profile again with its songs to enable live matching for that group. [EasyWorship Collections guide](https://help.easyworship.com/SongScripturePresentationandThem.html)

In **คลังเพลง**, use **สร้างกลุ่มเพลง** to create a song group or folder. Choose a destination folder, add automatic rules that match all or any conditions, and mark individual songs to include or exclude. Select a saved group and choose **แก้ไขกลุ่มเพลง** to edit its name, supported rules, or manual selections. Imported groups with unsupported rules or unresolved source references can still be renamed. This browser stores the groups and edits, including edits to imported groups when you import the original profile again.

In a playlist, choose **เพิ่มเพลง** to browse the same song collections and folders. Search by title, artist, or lyrics within the selected group. Use **ดูเนื้อเพลง** to check a song before adding it. **เพิ่มอีกครั้ง** creates another occurrence at the end of the playlist. [EasyWorship schedule resource workflow](https://help.easyworship.com/AddingItemstotheSchedule.html)

The same import provides **กลุ่มสื่อ** in the media library and **กลุ่มสไลด์และธีม** in the slide library. It matches each native item through its own catalog, including cataloged audio and attached PowerPoint decks imported from the profile. Import the profile again with its source catalogs to connect groups from a previously imported `Collections.db`. The filter lists groups saved in the current browser. [EasyWorship resource collections](https://easyworship.com/blog/creating-and-using-collections)

**กลุ่มสื่อ** filters files, live feeds, and DVD clips. Supported automatic rules match all or any conditions against the current display title, author, description, tags, filename, or source folder where available. Linked manual inclusions and exclusions still apply after an item is renamed. Groups with unsupported rules or missing manual links use the saved membership. Import the original profile again with `Media.db` to link any media references from an earlier import. [EasyWorship Quick Start](https://support.easyworship.com/support/solutions/articles/24000020385-quick-start-guide)

**กลุ่มสไลด์และธีม** applies supported rules separately to presentations and themes, including PowerPoint in presentation groups. Rules use the current title and available author, copyright, description, tags, filename, and source folder. Manual inclusions and exclusions keep their resource links. Import the original profile again with its slide catalogs to restore missing collection links and metadata in an older import. Rows with unavailable rule data or groups with unresolved rules or manual links use the saved membership where the rule's result is unknown. [EasyWorship Collections guide](https://help.easyworship.com/SongScripturePresentationandThem.html)

Use **สร้างกลุ่มสื่อ** or **สร้างกลุ่มสไลด์และธีม** to organize existing files, feeds, DVD clips, presentations, and themes. Choose an imported or local folder, set rules, and override individual items. Use the edit button to rename or move a group. Deleting a folder removes its descendant groups and keeps the original resources in their libraries. Collection edits and deletions are retained when you re-import the same catalog and in `.wtlibrary` backups. [EasyWorship media collections](https://help.easyworship.com/MediaCollections.html)

Open **พระคัมภีร์ → กลุ่มพระคัมภีร์** to browse verses, search within a group, and choose verses for the audience display or a playlist. Import the matching `.ewb` when the group shows a missing edition. Supported rules use the current text in the named editions, or in each installed edition when the rule names none. Manual inclusions and exclusions still apply to their original edition. Groups with unrecognized rules use saved results when available. In **คำหรือวลี**, enter several keywords to find verses with every word or quote a phrase to search for it together. [EasyWorship Scripture and resource collections](https://help.easyworship.com/SongScripturePresentationandThem.html) · [Searching Scripture](https://help.easyworship.com/SearchingScriptures.html)

Use **สร้างกลุ่มพระคัมภีร์** to create a collection or a nested folder. Choose the editions used by automatic rules and add text conditions that match all or any criteria. In **เลือกข้อพระคัมภีร์เอง**, search an installed edition by reference, range, words, or phrase. Include or exclude verses for that edition. Edit a supported imported group with **แก้ไขกลุ่มพระคัมภีร์**. The collection edits stay with the browser when you re-import the original profile, and `.wtlibrary` carries the edited groups and installed editions. [EasyWorship Scripture collections](https://help.easyworship.com/SongScripturePresentationandThem.html)

### Reviewing song activity

Open **คลังเพลง → ประวัติการใช้เพลง** to view imported activity or choose the original `SongHistory.db` directly. Select a history, date range, and action. **พิมพ์รายงานการใช้เพลง** prints or saves a PDF of every matching event, either summarized by song or listed by time. The CSV download includes the filtered events with the original event codes and timestamps. An unchanged export reuses the saved history. Different backups are available as separate reports so their overlapping activity is counted only within the selected backup. [EasyWorship song activity reports](https://support.easyworship.com/support/solutions/articles/24000020414-songs-printing-reporting)

The **WorshipTeam** history records songs created in the library and songs shown on the audience output in this browser. Records include the song title and credits captured at the time of the event.

Choose **WorshipTeam** under **ชุดประวัติ** to see songs shown on the audience output from a playlist or the song library. Advancing through the slides of a song occurrence, opening a second audience output, or reloading the presenter keeps the same event. A repeated occurrence later in the playlist counts again. The report stores these events in this browser and includes the CCLI or reference number when available.

To move the report to another browser, export a `.wtlibrary` from **คลังสื่อ → ย้ายคลังสื่อไปอีกเครื่อง**. It includes each imported EasyWorship history and the browser's WorshipTeam events. Restoring the package merges WorshipTeam events by ID and keeps events already present at the destination. The restored EasyWorship report retains the original timestamps and provider fields for CSV export.

### Migrating saved EasyWorship alerts

Select **ข้อความแจ้งเตือน** in the profile review, or choose `Alerts.db` in **คลังข้อความแจ้งเตือน**. The profile importer looks under `v6.1/Options/<name>.ewo/Data`. Review the imported names, text and display targets in the alert library. There you can edit imported messages and create new templates. Importing the same records again keeps local edits. [EasyWorship message templates](https://help.easyworship.com/MainOutputMessageAlerts.html) · [EasyWorship Foldback alerts](https://help.easyworship.com/FoldbackAlerts.html)

In the presentation controls, choose a saved message for the audience, stage or broadcast, edit the draft if needed, and send it to that display. **รูปแบบและจำนวนรอบ** shows the display options inherited from the selected template. Messages can stay still, scroll, or scroll only when they exceed the output width. Fixed-count alerts clear after the selected number of passes. A stationary pass lasts six seconds. When the browser requests reduced motion, messages stay still. [EasyWorship message display options](https://help.easyworship.com/MainOutputMessageAlerts.html)

Each output has its own queue. Use **เพิ่มเข้าคิว** while a message is showing. The next message starts after the current rounds or countdown finish. **แสดงข้อความถัดไป** moves the current message to the end of the queue. **แสดงก่อน** interrupts it and places it first to resume with its remaining rounds. The active message can be cleared individually, and **ล้างคิวทั้งหมด** clears the selected output. Use **เพิ่มหนึ่งรอบ** or **ลดหนึ่งรอบ** while a fixed-count message is live. [EasyWorship message queue controls](https://help.easyworship.com/MainOutputMessageAlerts.html)

An imported placeholder such as `{{นาฬิกา}}` fills with its current value on the output. Timers start when their message first reaches the output and keep that start time through a priority interruption or reload. An alert with a countdown chosen as its ending condition can clear when that countdown expires. Import the full profile to include weekly service times, or attach `ServiceIntervals.db` when selecting `Alerts.db` from the same folder in **คลังข้อความแจ้งเตือน**. The library keeps the source RTF, token definitions and any local edits. [EasyWorship tokens](https://help.easyworship.com/Tokens.html) · [EasyWorship service intervals](https://help.easyworship.com/ServiceIntervals.html)

In the alert template editor, open **โทเค็นข้อความและตัวจับเวลา** to create or edit a text value, clock, service countdown, countdown to a local time, or duration timer. Use **แทรก** to insert the token at the cursor. Set weekly service times in the template for the three service countdown modes. To finish the alert automatically, choose **เมื่อโทเค็นหมดเวลา** and select its countdown. Renaming a token updates its placeholders throughout the message. The `.wtlibrary` backup carries the edited token definitions and weekly times, including the original EasyWorship RTF when available.

The profile review lists **คลังโทเค็นและเวลานมัสการ** for the selected EasyWorship option set. It includes unused tokens from `Alerts.db` and the weekly times from `ServiceIntervals.db`. In the alert editor, select the destination screen and open **ใช้ข้อมูลจาก EasyWorship** to copy a token for that screen or use the catalog's weekly times. A standalone `ServiceIntervals.db` also works from the alert library. `.wtlibrary` version 10 carries the catalog to another browser, including catalogs with no saved templates.

Open **จัดรูปแบบข้อความ** in the alert editor to change the font, relative size, color, emphasis, shadow, or outline. Select text to format just that part. With the cursor alone, the controls format the entire message. **ล้างรูปแบบ** returns the selection to the screen defaults. Formatting any part of a token applies the change to its whole live value. The preview uses the selected output's message colors and text effects. The library backup keeps your edits together with the imported RTF when present. [EasyWorship message alert formatting](https://help.easyworship.com/MainOutputMessageAlerts.html)

The three outputs render imported RTF text colors, font families, relative sizes, bold, italic, underline, outline and shadow. Imported effects use their saved colors and opacity, along with relative outline width and shadow blur, distance and angle when present. A clock or countdown keeps the formatting of its placeholder as it updates. Editing a section of a draft keeps the formatting around the edit. The `.wtlibrary` backup carries the source RTF to the destination browser. [EasyWorship message formatting](https://help.easyworship.com/MainOutputMessageAlerts.html)

Choose **ค่าเริ่มต้นข้อความแจ้งเตือน** in profile review to migrate each output's enable state, top or bottom position, background, opacity, font and scroll speed. The importer looks for `LiveMessage.Settings.db`, `FoldbackMessage.Settings.db`, and `AltOutMessage.Settings.db` in the selected option set. Edit these defaults for any output in **คลังข้อความแจ้งเตือน → ค่าเริ่มต้นข้อความแจ้งเตือน**. The `.wtlibrary` backup carries the settings, and re-import preserves settings already saved for that output. [EasyWorship Main Alerts options](https://help.easyworship.com/MainAlerts.html) · [EasyWorship Alternate Alerts options](https://help.easyworship.com/AlternateAlerts.html) · [EasyWorship Foldback alerts](https://help.easyworship.com/FoldbackAlerts.html)

The default font migration also carries underline, strike-through, superscript, subscript, text opacity, shadow and outline for message and nursery alerts. Open **เอฟเฟกต์ตัวอักษร** in the relevant settings to edit them. Explicit formatting in a saved alert overrides the corresponding output defaults. Outer and center outline settings use the browser's text stroke. The backup retains the native inner outline and join choices. The web display renders an inner outline as centered and uses the browser's glyph joins. [EasyWorship default font options](https://help.easyworship.com/MainGeneral.html)

Choose **การเรียกผู้ปกครอง** in profile review to migrate settings from `LiveNursery.Settings.db` and `AltOutNursery.Settings.db` in the selected EasyWorship option set. The review lists the audience and broadcast settings separately. Import carries over whether each output is enabled, screen corner, colors, background opacity, font family, relative size, bold, italic and automatic removal time when saved. Re-import keeps the destination settings for an output that already has saved settings. [EasyWorship Main Alerts options](https://help.easyworship.com/MainAlerts.html) · [EasyWorship Alternate Alerts options](https://help.easyworship.com/AlternateAlerts.html)

Open **เรียกผู้ปกครอง** during a presentation to display a pickup code, such as `007`. Use **เอาออก** to remove one code or **ล้างหมายเลขทั้งหมด** to remove the active list. Edit the style for each output in **คลังข้อความแจ้งเตือน → ตั้งค่าการเรียกผู้ปกครอง**. An imported relative size scales with output height until you set a size in pixels. The initial WorshipTeam settings enable the audience display for 30 seconds. A `.wtlibrary` carries the saved options. [EasyWorship Nursery Alerts](https://help.easyworship.com/NurseryAlerts.html)

### Importing an EasyWorship schedule

1. Apply the schedule migrations through [EasyWorship schedule presentation links](supabase/migrations/20261124084249_easyworship_schedule_presentation_links.sql) before publishing the updated app.
2. In EasyWorship, save the schedule as `.ewsx`. Select **Pack files in schedule** to include attached media. For an older backup, select its original binary `.ews` file. [EasyWorship schedule guide](https://help.easyworship.com/SavingTransferringASchedule1.html)
3. In WorshipTeam, open **เพลย์ลิสต์ → นำเข้าตาราง EasyWorship**, review the ordered cues and slides, then save the playlist. If a legacy schedule shows garbled Thai, select **ไทย (Windows-874)** and review again. Importing the same source again brings you back to the same playlist.

Each scheduled song keeps its own slides and notes. The importer links it to the library if exactly one song has the same EasyWorship ID. This also works when re-importing the same playlist after importing its library songs. Review multiple matching versions in **ตรวจเพลงในตารางเทียบกับคลัง**. The schedule import summary and profile CSV show how many occurrences were linked and how many still have several matching versions. If you delete a linked library song later, scheduled occurrences with their own slides remain playable.

The importer links native presentations by EasyWorship ID and recovered PowerPoint slides by the fingerprint of the imported source `.pptx` or `.ppt`. A link keeps the playlist's own title, slides, and notes. A repeat import can add a missing link after the library is available, and it can recover the fingerprint for an earlier PowerPoint import when the saved slides still match. Choose among multiple matching versions in **ตรวจงานนำเสนอในตารางเทียบกับคลัง**. The import summary and profile CSV show linked and ambiguous occurrences.

The schedule and slide text are saved to Supabase. Native EasyWorship song and presentation cues can carry positioned text, fills, and layers with packed images and muted video. A looping background video continues across consecutive slides that use the same background layer. Supported media are saved to this browser.

When a schedule includes a nested `Global` theme, matching slides can inherit its background, soundtrack, transition and advance settings through their own theme. The schedule lists the playable items in source order. Older playlists omit the unchanged stock `Global` item from the editor and presentation while keeping the stored record. [EasyWorship theme inheritance](https://support.easyworship.com/support/solutions/articles/24000020894-using-themes)

For images, video, and audio packed inside an `.ewsx`, the importer checks the ZIP checksum and the original SHA-256 when available. The review lists unreadable or mismatched files as missing. Recover a rejected packed file by supplying its original or using a matching copy in the media library. Re-import can repair that source slot in a previously saved playlist or appended batch while retaining local media choices.

If the schedule has a saved SHA-256 value, the review verifies attached files and can recover an exact original from **คลังสื่อ** even after a rename. A same-name file with different contents leaves the original reference unresolved. Select any remaining originals under **ไฟล์ภาพ วิดีโอ หรือเสียงที่ขาด** and review again. For an older `.ews` without a saved hash for its `.wmv`, `.avi`, `.mpg`, or `.mpeg` video, attach a converted `.mp4` with the same base filename.

Choose **แนบโฟลเดอร์สื่อต้นฉบับภายนอก** to review a copied folder of images, videos, audio, and PowerPoint decks with the `.ews` or `.ewsx`. Keep the original subfolders. Without SHA-256, an absolute path saved in the schedule can distinguish files with the same name by their directory suffix and recorded size. Ambiguous paths stay unresolved. The same folder can repair the existing playlist or a selected appended batch. [EasyWorship schedule packing](https://help.easyworship.com/SavingTransferringASchedule.html)

WorshipTeam Desktop converts supported WMV, AVI, MPG, and MPEG sources to H.264/AAC MP4 when saving a schedule or a media catalog. Keep the original files packed in the schedule, in the EasyWorship profile's Resources, or attach them during review. The importer checks the original bytes against the saved SHA-256 when resolving a verified schedule reference. The MP4 stays playable in browsers after restoring a library backup. Desktop needs FFmpeg with H.264 and AAC encoding and supports original and converted files up to 4 GiB. Set `WORSHIP_VIDEO_FFMPEG` to the executable's absolute path if it is outside `PATH`. [EasyWorship video formats](https://support.easyworship.com/support/solutions/articles/6000028727-what-media-formats-work-in-easyworship-) · [FFmpeg MP4 muxer](https://ffmpeg.org/ffmpeg-formats.html#mov_002c-mp4_002c-ismv)

Re-import the same schedule to fill missing media in the original playlist or appended batch while keeping slide edits. The profile importer can also use the files in Resources. Identical media recovered through direct import and a profile can play from either local store. For references without a saved hash, a different attachment for a previously recovered slot creates a separate playlist version. To intentionally replace a file with a different version, edit the media on the playlist slide. [EasyWorship guide to packing files in schedules](https://help.easyworship.com/SavingTransferringASchedule.html) · [Tested formats](docs/easyworship-compatibility.md)

Scripture cues in SQLite `.ewsx` schedules keep their saved text, slide layout, and verse ranges. If a slide is missing verse text, choose the matching file under **แนบฉบับพระคัมภีร์ .ewb** and review again. The preview shows which EasyWorship translation IDs matched and reports any conflicting or unsupported files. Saving stores the verse text used by the schedule. To add the complete edition to the library, import it in **พระคัมภีร์** or with the profile importer.

Review the same `.ewsx` with the matching edition to fill missing verses in an existing playlist. The importer keeps saved wording, manual edits, and local slide layouts. When only the earlier recovered copy exists, importing the same editions and attachments reuses it. [EasyWorship scripture schedules](https://help.easyworship.com/AddingScripturetotheSchedule.html)

Audio cues and attached soundtracks can play from packed `.ewsx` files or the matching profile's `Resources/Audio`. A shared soundtrack continues through consecutive slides in the same cue. The operator can pause, resume, and mute it, and **Black** cuts the sound. To add a soundtrack in WorshipTeam, import the audio into **คลังสื่อ**, open **แก้ไขรายการ** on a playlist item, and choose the audio under **เพิ่มสื่อบนสไลด์**. Use **ใช้เสียงนี้ทุกสไลด์** to apply it throughout that occurrence. [EasyWorship soundtrack workflow](https://support.easyworship.com/support/solutions/articles/24000020405-add-background-audio-to-songs-presentations)

The binary `.ews` importer preserves repeated entries, song sections, scripture text and references, supported embedded images, video and audio, and cached presentation images. Packed `.pptx` decks become editable slides automatically. WorshipTeam Desktop can convert packed legacy `.ppt` files with LibreOffice Impress. When the deck cannot be read, its cached presentation images can still play. Attach the matching source deck or a previously converted `.pptx` to recover editable slides. The profile importer can also match media from that profile's Resources, including an MP4 with the same base filename as a legacy MPEG video. [Binary EWS format reference](https://github.com/meinders/lithium-ews/blob/master/docs/ews%20file%20format.md)

Legacy song databases and binary schedules also import supported RTF character and paragraph formatting, including emphasis, color, font, relative size, and indentation. Re-import the same schedule and attachments to fill missing formatting where the original slide ID and saved text still match. The playlist keeps locally edited words and existing character formatting. The import summary and profile CSV report restored slides.

Re-import the original `.ewsx` directly or from its profile to fill missing transitions and slide advance settings in a saved playlist. The importer matches original slide IDs through changes to the playlist order. Existing effects, advance settings, and a saved **ตามธีมที่ใช้** choice take priority. The summary and profile CSV show how many slides were updated. [EasyWorship slide transitions and timing](https://support.easyworship.com/support/solutions/articles/24000020392-creating-announcement-loops-in-easyworship)

When the original `.ewsx` or profile is imported again with detached media that all match their saved SHA-256 values, the import reuses the original playlist even if its media slots were removed or replaced in WorshipTeam. A different same-name attachment without a saved fingerprint can still produce a separate version.

### Adding an EasyWorship schedule to an existing playlist

Apply the [append schedule migration](supabase/migrations/20261124090439_append_easyworship_schedule.sql). Open the destination playlist, choose **เพิ่มตาราง EasyWorship**, and review the `.ews` or `.ewsx` file and any missing attachments. Select **เพิ่มต่อท้ายเพลย์ลิสต์**. The imported items keep their original order and repeated songs. Available library links are carried over by source ID, and the existing entries, title, and notes keep their saved values.

The same file and attachments can be submitted again to resume a saved batch or restore its media on this browser. Select **เพิ่มชุดนี้อีกครั้ง** to create a second copy intentionally. Each batch keeps its own media, even when an earlier schedule used the same internal filenames. [EasyWorship schedule editing](https://help.easyworship.com/EditingScheduleItems1.html)

When all resolved attachments match the schedule’s saved SHA-256 values, a regular append uses the original schedule’s batch identity. You can retry with or without those attachments after a new batch is saved. For a batch saved by an earlier version with an attachment-based identity, review it with the same attachments to recognize its saved operation.

To fill missing transitions or timing in an already appended `.ewsx`, review the original schedule and choose the batch in **ชุดที่เพิ่มไว้แล้ว**. Select **คืนเอฟเฟ็กต์และเวลาเลื่อนในชุดเดิม**. When other data can also be recovered, the same action is labeled **กู้ข้อมูลในชุดเดิม**.

To restore inherited backgrounds or the original position and settings of a live Feed, review the original `.ewsx` and attach any missing background files. Select the batch and choose **คืนพื้นหลังและเลย์เอาต์ในชุดเดิม**. The repair keeps the existing cues, notes, and compatible local slide edits. [EasyWorship theme inheritance](https://support.easyworship.com/support/solutions/articles/24000020894-using-themes)

Re-import the original `.ewsx` directly or from its profile to recover missing background audio inherited from a master slide. For an appended schedule, choose the batch and select **คืนเสียงประกอบในชุดเดิม**. Attach the original audio file if it was stored separately. Recovery keeps existing soundtracks and removals recorded by the playlist editor. [EasyWorship background audio](https://support.easyworship.com/support/solutions/articles/24000020405-add-background-audio-to-songs-presentations)

If you find missing media after you append a schedule, open **เพิ่มตาราง EasyWorship** for the same playlist and review the original schedule with the newly found files. Under **ชุดที่เพิ่มไว้แล้ว**, choose the batch by its current position and select **กู้สื่อในชุดเดิม**. This keeps that batch’s order, notes and slide edits. Media already assigned to a different file stays as saved. The older default batch can also be recovered when it was originally added without attachments.

For missing Scripture in an appended `.ewsx` batch, review the original schedule from the same playlist with a matching `.ewb` attachment or a matching edition in **พระคัมภีร์**. Select the batch under **ชุดที่เพิ่มไว้แล้ว** and click **กู้ข้อพระคัมภีร์ในชุดเดิม**. If there are also media or PowerPoint files ready to recover, use **กู้ข้อมูลในชุดเดิม**. The selected batch keeps its occurrence IDs, saved wording, intentionally blank slides, layout and timing. [EasyWorship Scripture schedules](https://help.easyworship.com/AddingScripturetotheSchedule.html)

Use the same batch picker after attaching a matching PowerPoint file or reopening a schedule with a packed `.ppt` in WorshipTeam Desktop. **กู้ PowerPoint ในชุดเดิม** replaces an unchanged placeholder or cached slide images with editable slides. If the batch also has matching media attachments, **กู้สื่อและ PowerPoint ในชุดเดิม** restores both in one pass. The summary reports occurrences that kept a locally edited fallback or an already imported version of the deck. [EasyWorship PowerPoint workflow](https://support.easyworship.com/support/solutions/articles/24000029975-how-to-add-a-powerpoint-presentation)

### Recovering library songs from an EasyWorship schedule

Open **เพลย์ลิสต์ → นำเข้าตาราง EasyWorship** and review an `.ewsx` or `.ews` file. In **เพิ่มเพลงจากตารางเข้าคลัง**, select **ตรวจเพลงกับคลัง**. The same action is available on an imported playlist containing EasyWorship songs. Check the source lyrics and select **เพิ่มเพลงที่เลือกเข้าคลัง** to create reusable songs with their credits, CCLI reference, and available slide formatting, advance settings, looping, and media. You can recover songs directly from the file without first saving a playlist.

Repetitions with the same lyrics and playback settings share one candidate. When copies of a song use different playback settings, choose **ฉบับตามรายการในตาราง** by its position in the schedule. Open **ดูเนื้อร้องและสไลด์** to check the selected copy's timing and media. An equivalent library song keeps its local chords. You can choose a distinct chart with the same title as a separate song. Select an earlier import again to fill any missing timing or restore packed media in this browser. [EasyWorship song merge workflow](https://support.easyworship.com/support/solutions/articles/24000022022-how-do-i-merge-songs-from-one-database-into-another-)

### Comparing a scheduled song with the library

Apply the [EasyWorship song UID migration](supabase/migrations/20261124082826_easyworship_song_uid.sql) and the [playlist song reconciliation migration](supabase/migrations/20261124120000_reconcile_playlist_song.sql). On a saved playlist that has a song with local slides, open **ตรวจเพลงในตารางเทียบกับคลัง**, choose its occurrence, and select **ตรวจฉบับเพลง**. The review can find a renamed library song by its EasyWorship ID. Import the original SQLite song pair or profile again to fill missing IDs on earlier imports. The review also supports existing links and title matches. Choose the library version when the sources remain ambiguous.

Keep the current version, add a separate library song, link the occurrence while keeping its local copy, or use the library version in the occurrence. Using the library version removes the occurrence's own slides and notes. A copy or replacement carries the selected occurrence's playback settings. Replacing a library chart keeps its song record and credits and carries over any unambiguous chord rows from its unchanged lyrics. Other occurrences that use that library chart will see the updated version. [EasyWorship Check Schedule for Changes](https://help.easyworship.com/EditingScheduleItems1.html)

### Comparing presentations and recovering schedule media

Apply the [playlist presentation reconciliation migration](supabase/migrations/20261124120100_reconcile_playlist_presentation.sql). Open **ตรวจงานนำเสนอในตารางเทียบกับคลัง** to preview the scheduled slides beside a library version. The comparison can find a renamed EasyWorship presentation by its source ID. Add a copy to the library, replace the slides of a library presentation, or copy the current library version into one schedule occurrence. A copy from the library retains the schedule note, position, and grouping. It keeps the copied slides if the library is edited later.

Profile import saves presentation notes from `PresentationLayouts.db`. Import the profile again to recover a missing note on an earlier import. Open **โน้ตงานนำเสนอ** in the slide library to read it, or edit it with **แก้ไขสไลด์**. New playlist occurrences start with that note and can be edited independently. The stage display shows the occurrence note while the audience and broadcast continue to show the slides. A `.wtlibrary` backup carries the library note, and a `.wtschedule` package carries the notes saved with its occurrences.

Open **เพิ่มสื่อจากตารางเข้าคลัง** to check the images, video, and audio used in the saved schedule. Identical file contents appear once, even when their filenames differ. Select which available files to add to the browser's media library. The review shows files already in the library and attachments that need to be restored from their source. [EasyWorship Check Schedule for Changes](https://help.easyworship.com/EditingScheduleItems1.html)

### Moving a playlist with its media

Apply the [EasyWorship song UID migration](supabase/migrations/20261124082826_easyworship_song_uid.sql). In a playlist, select **ส่งออกเพลย์ลิสต์พร้อมสื่อ** to download a `.wtschedule` package. It includes the ordered entries, date, notes, songs and chords, per-entry edits and transposition, applied themes, and available images, videos, and audio. Song copies include copyright, CCLI number, copyright administrator, description, tags, and the EasyWorship song ID when present. It also packages those resources when the playlist came from an EasyWorship schedule. If any media is absent from the current browser, check the names before downloading the available files.

On the destination, open **เพลย์ลิสต์ → เปิดแพ็กเกจเพลย์ลิสต์**, review the entries and media count, and select **สร้างสำเนาเพลย์ลิสต์**. Linked songs become new library copies, and repeated occurrences of the same song share that copy. The media is restored in the destination browser. The import needs a configured Supabase project. Use the destination's output settings and default themes, and assign any cameras to devices on that computer. Web cues continue to use their saved URLs.

### Presenting webpages and cameras

1. Apply [the live camera cue migration](supabase/migrations/20261123052200_live_camera_cues.sql) to an existing database before saving camera cues. In a playlist, open **เพิ่มเว็บหรือกล้อง** to add a URL or name a camera. EasyWorship schedule import also preserves recognised web and camera references.
2. Open the presentation controls and click **Open Presenter**. Select the web or camera cue. For a camera, select a video input under **กล้องบนเครื่องนี้** and click **ใช้กล้องนี้**. Choose a microphone if the cue needs audio. The presenter uses the browser's media permissions over HTTPS or localhost. Camera and microphone assignments are saved in this browser. [EasyWorship feed workflows](https://support.easyworship.com/support/solutions/articles/24000020396-feeds)
3. If a webpage blocks embedding, use **เปิดเว็บโดยตรง** in the controls. Sites control where their pages can be embedded. [Web embedding policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors)

Use **คลังสื่อ → เว็บ** to enter a URL, show it immediately, or add it to a playlist. Native EasyWorship web frames in profiles and `.ewsx` presentations retain their saved URL, position, size and scrollbar setting. Edit the frame in the slide library or in a playlist occurrence. Preview shows the hostname and the live audience window opens the page. [EasyWorship Web workflow](https://supportresources.easyworship.com/EasyWorship7Manual.pdf)

During playlist playback, the stage and broadcast also display standalone webpages and positioned web frames. Each display opens its own page instance. Use the audience display to interact with the page or play its sound. The secondary displays and NDI feeds use read-only frames with autoplay disabled. The Alpha Key uses an opaque mask at the frame's bounds. [Browser autoplay policy](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)

### Editing an item in a playlist

Choose **สร้างงานนำเสนอเปล่า** in the playlist to start with one editable slide. Add slides, text, media, timings, and an item note in the editor. **เพิ่มลงเพลย์ลิสต์** saves the presentation at the end of the current schedule. Cancel to discard an unsaved draft. Use **ดูสไลด์** beside an item or **ขยายสไลด์ทั้งหมด** to review slide order, text, and media names in the playlist. [EasyWorship schedule editing](https://help.easyworship.com/EditingScheduleItems1.html)

In the song layout, presentation editor, or theme editor, choose a frame under **กรอบที่จะแก้ไข** or select it on the preview. Drag the frame to move it or drag its corner to resize it. With focus on the preview, use the arrow keys to move the frame and **Shift + arrow** to resize it. Song frame changes apply to the selected master or slide. [EasyWorship slide elements](https://support.easyworship.com/support/solutions/articles/24000020402-adding-and-editing-songs)

Use **เพิ่มข้อพระคัมภีร์** in a library presentation or a presentation in the playlist to add an independent frame from an installed Bible edition. The same frame is available on the audience and broadcast displays and in portable schedules. An imported EasyWorship Scripture field uses the matching broadcast template slot when one is available and keeps its source frame when the template has no Scripture slot. [EasyWorship presentation editing](https://support.easyworship.com/support/solutions/articles/24000020400-creating-editing-a-presentation)

Open **นำเข้าข้อความจากไฟล์** in a song or presentation editor in the library or playlist. Choose a `.txt` or `.rtf` file and preview its text. UTF-8 and marked UTF-16 files open automatically. For older Thai text files, choose Windows-874 if the automatic preview cannot read the file. Keep the document together or split it at blank lines and page breaks. **เพิ่มข้อความที่ตรวจแล้ว** adds the previewed content to the draft, and the editor's save action writes it to the library or playlist. A presentation import fills an empty slide or inserts slides after the active slide. In the song library, it appends sections and preserves the existing lyrics and chords. [EasyWorship presentation editing](https://help.easyworship.com/EditingPresentations.html) · [EasyWorship song editing](https://support.easyworship.com/support/solutions/articles/24000020402-adding-and-editing-songs)

In a theme, select the slide and open the same import. The file becomes one fixed text box. Move or resize the box in the preview. When the theme is used, the song lyrics, Scripture, and other template fields still receive their live content. [EasyWorship theme editor toolbar](https://help.easyworship.com/EditingPresentations.html)

Apply [the playlist editing migration](supabase/migrations/20261123054200_edit_playlist_items.sql) to an existing database. Open **แก้ไขรายการ** on the occurrence you want to change. Edit the title, notes, lyrics, text layers, media, web address, or camera name. Add, duplicate, remove, or move its slides and optionally set a time for each slide. Preview layered slides in the editor before saving.

Editing a linked library song creates a version for that occurrence. The audience window, stage view, and PDF use the saved lyrics and chords. Select words in the slide's lyric text to change their formatting, including in a layered song imported from EasyWorship. The audience and broadcast outputs show the saved styles. **คืนเนื้อหาจากคลังเพลง** restores the current library version. Edits to different occurrences stay separate. [EasyWorship schedule song editing](https://help.easyworship.com/EditaSong.html)

In a song occurrence, place the cursor in the lyric text and use **แบ่งสไลด์ตรงเคอร์เซอร์**, Ctrl+Enter, or ⌘+Enter. Chord positions, lyric formatting, and the surrounding layers follow the split. The first slide keeps its original timing and transition. The continuation starts in manual mode. Set **การแบ่งบรรทัดสำหรับรายการนี้** to wrap the text or limit the lines within each prepared slide. Choose **ตามสไลด์ที่จัดไว้** to use the saved slide boundaries directly. The editor previews the generated slides, and `.wtschedule` carries the saved boundaries and line setting. [EasyWorship song slide splitting](https://help.easyworship.com/EditaSong.html)

To reuse a layout every time you schedule a song, open it in the song editor and select **จัดสไลด์ในคลังเพลง**. Choose a section and place the cursor in its lyrics. Use **แบ่งสไลด์ตรงเคอร์เซอร์** or Ctrl+Enter to add a break, and **รวมกับสไลด์ถัดไป** to remove one. **ใช้การจัดสไลด์** updates the song draft. Save the song to use the layout from the library or in linked playlist entries. Imported songs use their original slide boundaries by default, including earlier imports. Select **แบ่งอัตโนมัติเมื่อฉาย** for sections that should use the live line-count setting. Portable schedules carry the library song's saved boundaries. [EasyWorship editing songs in the library](https://help.easyworship.com/EditaSong.html)

Select words in the library or occurrence editor to apply **ตัวหนา**, **ตัวเอียง**, **ขีดเส้นใต้**, a color, a typeface, or a relative font size. Open **เอฟเฟ็กต์ข้อความ** for strikethrough, shadow, and outline. **คืนรูปแบบพื้นฐาน** uses the slide's base text style for the selection. The preview shows the formatted lyrics after splitting or wrapping. Save the song or occurrence to use the styles on the audience and broadcast outputs. `.wtschedule` and `.wtlibrary` carry formatting saved in the songs and occurrences they contain. [EasyWorship Song Editor toolbar](https://help.easyworship.com/EditaSong.html)

Select lyrics and open **เอฟเฟ็กต์ข้อความ** to edit the outline or shadow. Set the color and opacity, then choose the outline width or the shadow distance, blur, and angle. Width, distance, and blur are percentages of the current font size. When a number field shows **หลายค่า**, typing a value applies just that property to the selected text. Library edits apply to the song, and playlist edits apply to the selected occurrence. [EasyWorship song formatting](https://help.easyworship.com/EditaSong.html)

Open **รูปแบบย่อหน้า** in either song editor. Place the caret inside one paragraph or select text across several. Use **เพิ่มระยะเยื้อง** and **ลดระยะเยื้อง** for a half-font-size adjustment, or set alignment, left and right indents, first-line indent, paragraph spacing, and line spacing. **คืนค่าย่อหน้า** uses the base paragraph settings and retains character styles. Imported soft line breaks stay inside their paragraph. [EasyWorship paragraph editing](https://help.easyworship.com/EditaSong.html)

EasyWorship schedule imports recover the original song slide labels, including repeated numbers and custom labels saved separately from the lyrics. Re-import the same `.ewsx` with the same attachments to fill labels that still have an old automatic name such as `Slide 2`. This works from the schedule importer or the profile importer. It uses the saved playlist and retains edits to its slide order, lyrics, media, and custom labels. The import result reports the number of labels recovered, and the profile CSV includes that count.

Linked library layouts import the label of the matching slide. Use **ป้ายชื่อท่อนบนสไลด์** in the library editor or edit the slide name in one playlist occurrence. In **ตั้งค่าจอ**, turn on **ป้ายชื่อท่อนเพลง** for the audience or broadcast. The label appears in the upper left when enabled and follows the `.wtlibrary` output preference. [EasyWorship song labels](https://help.easyworship.com/EditaSong.html) · [EasyWorship broadcast labels](https://help.easyworship.com/AlternateSong.html)

In **จัดสไลด์ในคลังเพลง**, open **เค้าโครงหลักของเพลง** to position the lyric box and set its alignment, base size, and background across the song. For a section using prepared slides, open **เค้าโครงเฉพาะสไลด์** and choose the slide to give it a different layout. In a playlist occurrence, **เค้าโครงสไลด์เพลง** offers the same controls for that slide or the entire occurrence. Choose a background color, image, or video. A slide-specific setting takes precedence over the master in the same editor. Portable backups carry the layouts and their available media. A dedicated broadcast theme still supplies the broadcast placement and background. [EasyWorship song slide customization](https://help.easyworship.com/EditaSong.html)

When moving a song library, include `PresentationLayouts.db` with `Songs.db` and `SongWords.db` to carry the incoming effect for each slide, including effects inherited from linked masters. Re-importing with the layouts fills missing effects on matching saved songs and keeps effects edited in WorshipTeam. In **จัดสไลด์ในคลังเพลง → เอฟเฟ็กต์ของท่อนเพลง**, choose an effect for the current section or use **ใช้เอฟเฟ็กต์นี้กับทุกท่อน**. A section uses that effect on each of its slides. A linked playlist plays the saved song effects, and portable backups retain them. [EasyWorship song transition settings](https://support.easyworship.com/support/discussions/topics/24000024312)

The same SQLite layout import carries manual advance, timed advance, advance after media, media restart, slide holds, and song looping. They work when presenting from the library and in a linked playlist. Open **จัดสไลด์ในคลังเพลง → เวลาเลื่อนสไลด์ของท่อนเพลง** to adjust the current section or choose whether the final automatic slide returns to the start. A section's playback settings apply to each of its prepared slides. Re-import fills missing settings and keeps local choices. Portable backups carry the settings and the available media. [EasyWorship advance and loop settings](https://support.easyworship.com/support/solutions/articles/24000020392-creating-announcement-loops-in-easyworship)

Open **ข้อความและสื่อซ้อน** inside a song layout to add a text box or a library image or video. Select a layer to position, resize, rotate, change its opacity, or arrange it in front of or behind other layers. You can edit or hide an existing text or media layer in the selected scope. Lyrics and chords stay in the chart, and the layer edits carry into portable backups with their available media. On a dedicated broadcast theme, the artwork keeps its own position and order around the theme's lyrics. [EasyWorship slide elements and Arrange controls](https://help.easyworship.com/EditaSong.html)

Choose **เพิ่มข้อพระคัมภีร์** in the same section to search an installed Bible edition by reference or text. Select the verses and add them as a separate frame on the song master or selected slide. **เปลี่ยนข้อพระคัมภีร์** starts with the saved verse addresses and keeps the frame's position and styling when you choose new wording. The text and reference travel with the song or playlist and can be projected in a browser without the edition installed. [EasyWorship Scripture elements in songs](https://support.easyworship.com/support/solutions/articles/24000020402-adding-and-editing-songs)

Use **สัญญาณสดพื้นหลัง** for a full-slide Feed in a song layout, or **เพิ่มกรอบสัญญาณสดในเพลง** under **ข้อความและสื่อซ้อน** for a positioned Feed. The master applies across the song, and a slide can have its own position and fit. A dedicated broadcast theme supplies the broadcast background while keeping authored and imported positioned Feeds. Portable schedules carry the Feed references and slide settings. Assign the input on each presentation computer. [EasyWorship media in songs](https://support.easyworship.com/support/solutions/articles/24000020402-adding-and-editing-songs)

Select **คลิป DVD พื้นหลัง** on the song master or a selected slide, or add an inset with **เพิ่มกรอบคลิป DVD ในเพลง** under **ข้อความและสื่อซ้อน**. The library and playlist presentation controls can match the clip to a local video and use the saved start and end marks. A separate broadcast lyric theme keeps positioned DVD frames. Export the playlist with media after matching the clips to carry the video files and their marks to another computer. [EasyWorship media in songs](https://support.easyworship.com/support/solutions/articles/24000020402-adding-and-editing-songs)

### Using an imported Bible edition

1. Open **พระคัมภีร์** and choose a supported `.ewb` file. EasyWorship distributes its Bible plug-ins in this format. [EasyWorship Bible plug-in documentation](https://support.easyworship.com/support/solutions/articles/6000038374-can-i-add-my-own-bible-to-easyworship-)
2. Choose an edition and search by reference or by text. Reference examples include `John 3:16–18`, `John 3:16,18`, and `John 3:17–4:2`. Book names and aliases come from the edition.
3. Review the selected verses and choose the slide layout. Use **ขึ้นจอผู้ชม** for a separate scripture display, or **เพิ่มข้อที่เลือกในเพลย์ลิสต์** to display them in a service schedule. Apply the [scripture cue migration](supabase/migrations/20261123030705_append_scripture_playlist_cue.sql) before using the playlist action against an existing Supabase project.

The complete edition stays in the browser. A saved playlist contains copies of the selected text and its references, so it can present those slides on another device. Protected plug-ins and older binary EWB files require a separately supported source format. [Tested editions and format limits](docs/easyworship-compatibility.md)

In **ตั้งค่าจอ → การแบ่งสไลด์จากคลังพระคัมภีร์**, choose automatic page breaks or one slide for the whole selection. Automatic mode measures the audience layout at the selected minimum font size and can start each verse on a new slide. The library's **ตามค่าจอผู้ชม** uses these settings, including those imported from `Live.Settings.db`. Choose another mode in the library to override the default for the current selection. Saved playlists and imported schedules keep their existing page breaks. [EasyWorship Main Scripture](https://help.easyworship.com/MainScripture.html)

Use **เลือกหนังสือและบท → เปิดบท** to browse without typing a reference. Under **เรียงรายการ**, choose the direction to browse. Saved slides keep the passage order. When browsing the library or searching by reference outside a collection, changing editions keeps the selected verse addresses and shows which ones are absent from the new edition. Review the new translation and click **ขึ้นจอผู้ชม** to show it. [EasyWorship Scripture navigation and sorting](https://support.easyworship.com/support/solutions/articles/24000020401-scriptures)

In **ตั้งค่าจอ → การแสดงข้อพระคัมภีร์**, choose how the audience and broadcast windows show references. Each can show the reference before or after each slide, after the passage on its last slide, on its own, or hidden. Choose **ใช้อ้างอิงทั้งตอน** to show the whole passage reference on each slide. Use **แสดงเลขข้อพระคัมภีร์** to display each known verse number at its start. This works with passages selected from an installed edition and EasyWorship slides whose verse starts can be identified. The default puts the slide reference after the verse text. Existing schedules keep their saved wording, including any numbers already typed into the text. These preferences travel in `.wtlibrary`. [EasyWorship main Scripture options](https://help.easyworship.com/MainScripture.html) · [EasyWorship Alternate Scripture options](https://help.easyworship.com/AlternateScripture.html)

Under **แบบอักษรบนจอผู้ชม** or **แบบอักษรบนจอถ่ายทอดสด**, set the typeface, color, weight, and effects for the passage text, generated verse numbers, and reference. Set the size as a percentage of the theme font or the display height. Imported sizes use display height. Use **ใช้ฟอนต์ตามธีม** to clear a role's overrides. Save to apply the changes to open output windows. The settings travel in `.wtlibrary`. [EasyWorship font options](https://help.easyworship.com/MainGeneral.html)

Use **เยื้องชื่ออ้างอิง** and **เพิ่มช่องว่างระหว่างข้อความกับชื่ออ้างอิง** for either display. Indentation narrows the reference line. Additional spacing goes between the passage and its reference. Turning a control on uses EasyWorship's 6% preset. The profile importer and `.wtlibrary` keep custom margins, including different values for each side. [EasyWorship Main Scripture](https://help.easyworship.com/MainScripture.html) · [EasyWorship Alternate Scripture](https://help.easyworship.com/AlternateScripture.html)

Use **ใช้ชื่อย่อหนังสือพระคัมภีร์** per output to display the spelling supplied by the Bible edition. The playlist keeps the full reference and any custom slide label. For an existing EasyWorship schedule, review the original file again with the matching `.ewb` installed or attached. The importer can use a native translation ID or a unique edition abbreviation in the saved reference. The saved schedule and its book names travel together in a backup. [EasyWorship Main Scripture](https://help.easyworship.com/MainScripture.html)

### Using videos with a separate alpha mask

WorshipTeam reads EasyWorship's saved Alpha Channel setting in `Media.db` and in video resources inside `.ewsx` schedules, presentations, and themes. In **คลังสื่อ**, use **รูปแบบ Alpha ของวิดีโอ** to change the setting for a video. Choose **ภาพบน · มาสก์ล่าง** for a vertical pair or **ภาพซ้าย · มาสก์ขวา** for a horizontal pair. Black in the mask is transparent, white is opaque, and gray is partially transparent. **อัตโนมัติ** uses the video's regular browser playback, including embedded alpha if the browser decodes it. [EasyWorship video properties](https://help.easyworship.com/EditingVideos.html) · [EasyWorship overlay video formats](https://help.easyworship.com/OverlayVideos.html)

The imported setting follows the video into presentations, slides, and portable playlists. Existing playlists keep their saved settings. Re-import a schedule with split alpha to create a version with the recovered settings, or select the properly configured library video on the relevant slides. To show another layer through the video, place the video above that layer in the design. For external keying, an opaque fill beneath the video also covers the transparent areas. The split renderer uses WebGL when available and limits its Canvas fallback to 1280 × 720.


### Importing an EasyWorship media library

1. Copy the profile folder with `Data/Media.db` and its `Resources` directory, keeping their relative paths. For older profiles, use `BackGrounds.DB` and `BackGrounds.MB` in the same `Data` directory and include any original images or videos in `Resources/Images` and `Resources/Videos`. A ZIP-compatible `.ewprofile`, `.ewpck`, or `.zip` with the same files also works. [EasyWorship profile guide](https://support.easyworship.com/support/solutions/articles/24000020412-profiles)
2. Open **คลังสื่อ → ย้ายคลังสื่อ EasyWorship**. Choose `Media.db`, the folder, or the archive and click **ตรวจคลังสื่อ**. A data-only export can reuse a file already in this browser’s media library when its SHA-256 matches the catalog. Select a profile if several are shown. Review missing and skipped items, then click **นำเข้าสื่อที่เลือก**.

For EasyWorship 2009 backgrounds, the app prefers original files and offers embedded fallback images when the source image is missing. Some fallback images have reduced resolution. A legacy video entry requires a playable original or a converted MP4 with the same base filename under `Resources/Videos`. The profile backup may contain shortcuts and preview images. [EasyWorship support on 2009 background files](https://support.easyworship.com/support/discussions/topics/24000015193)

For SQLite `Media.db`, the importer can find a missing catalog file that was moved or renamed within the selected profile's `Resources/Images`, `Resources/Videos`, or `Resources/Audio` directory. The file must have the size and SHA-256 recorded in the catalog. The review shows the recovered filename and preserves the catalog title. When you import the whole profile, this match also restores references from song layouts, designs, output themes, and schedules that use the missing file.

In the profile or standalone `Media.db` review, attached files can match the catalog by SHA-256 even after a rename. Without a recorded hash, a file selected individually must match the original filename and size and point unambiguously to one catalog entry. For matching by the stored disk or network path, choose **แนบโฟลเดอร์สื่อต้นฉบับภายนอก** and keep the original subfolders. Unmatched or ambiguous catalog entries stay visible for review. Imported collections that filter by filename use the original catalog filename.
3. Select an item in **คลังสื่อ** to preview it, send it live, or add it to a playlist. Apply the [playlist cue migration](supabase/migrations/20261123030705_append_scripture_playlist_cue.sql) for new cues and the [playlist background migration](supabase/migrations/20261123033014_playlist_entry_background_media.sql) to assign per-item backgrounds.

The profile importer matches verified image and video records to files under the same profile's `Resources/Images` and `Resources/Videos`. Individual supported audio files can be added through **เพิ่มไฟล์สื่อ**. The browser needs to support the file's codec. For audible playback Chrome may ask for a click in the audience window.

Media bytes stay in the browser. Playlist entries save references in Supabase. Import the same original files or restore a media library package in the other browser to make those references playable.

In **คลังสื่อ**, open **ข้อมูลสื่อ → แก้ข้อมูลสื่อ** to edit the author, copyright, description, and tags. Search accepts those fields, the title, and the original catalog filename. Changing a field also updates any supported automatic media groups that use it. Re-import keeps local names and information edits, including cleared fields. The `.wtlibrary` backup carries the edited information to another browser. [EasyWorship image properties](https://help.easyworship.com/EditingImages.html) · [EasyWorship video properties](https://support.easyworship.com/support/solutions/articles/24000020404-videos)

#### Updating media already in a playlist

Apply the [playlist media update migration](supabase/migrations/20261124170406_update_playlist_media.sql) to an existing Supabase project. In **คลังสื่อ**, select the media and destination playlist. Open **อัปเดตสื่อในเพลย์ลิสต์**, choose **ตรวจรายการที่จะอัปเดต**, and confirm the entries you want to update. The update applies the library's playback and preview settings to matching cues, layers, and backgrounds. A cue title that still follows the library name also updates. The playlist keeps custom labels, notes, and layer placement.

New links use the catalog record's ID so two clips that share a file can keep separate settings. For older and imported references, the review uses the file identity or the saved checksum and checks the original filename when it needs to distinguish records. An ambiguous reference can be linked explicitly by selecting its source in the cue editor. If another window changes a reviewed row, check the latest playlist again before applying. [EasyWorship Update items in Schedule](https://help.easyworship.com/EditingVideos.html)

### Moving the media library to another computer

Open **คลังสื่อ → ย้ายคลังสื่อไปอีกเครื่อง**. Use **ดาวน์โหลดแพ็กเกจคลังสื่อ** for up to 1 GB of packaged file bytes. For larger libraries, choose **บันทึกแพ็กเกจลงดิสก์** in a browser that offers the option, then pick a destination with enough free space. The `.wtlibrary` file contains the catalog and media files, schedule attachments, Feeds, DVD clips with any available replacement videos, browser-local collections, song activity history and default output themes. Installed Bible editions travel with the package, including their verse text, edition IDs, and available copyright and license metadata. Saved alert templates keep their output, display behavior, tokens and linked weekly service times. The export reports DVD replacements and default theme media whose files are missing. [Chrome file saving](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)

On the destination, open the same panel, select the package, review the counts and Bible edition names, and choose **เรียกคืนคลังสื่อ**. Restore verifies each file as it stores it. Available browser storage determines how much media the destination can keep. Existing destination records and edits take precedence, including an installed Bible with the same ID. Older `.wtlibrary` backups can still be opened. When both computers use the same Supabase project, existing presentations and playlists keep their original references to the restored files. Assign cameras, microphones, and NDI sources on the destination. Use `.wtschedule` to create a playlist copy in another Supabase project. You can also install an individual Bible edition directly from its `.ewb` file. [EasyWorship profile transfer](https://support.easyworship.com/support/solutions/articles/24000043114-transfer-easyworship-profile)

### Moving the full library to another Supabase project

After a successful EasyWorship profile import, select **สำรองฐานข้อมูลโปรเจกต์พร้อมสื่อ** in the results. You can also open the media transfer panel and select **รวมฐานข้อมูลเพลง งานนำเสนอ ธีม และเพลย์ลิสต์จากโปรเจกต์นี้**. The version 11 `.wtlibrary` includes those database records, saved URL backgrounds, and the browser media and settings. It retains the original IDs so playlist entries, song versions, collections, and available media still refer to the same resources. The export reports referenced files that are missing from this browser.

Apply the [library playlist restore migration](supabase/migrations/20261124120200_restore_library_playlist.sql) to the destination project. Open the package in a browser connected to that project, review its counts, and select **เรียกคืนฐานข้อมูลและคลังสื่อ**. Existing records with the same ID keep the destination version. Each newly restored playlist is saved with all its ordered entries in one transaction. A restore can be retried after a connection failure. Continue to use `.wtschedule` when you want a separate copy of one playlist.

### Migrating DVD clips

Include `Media.db` in the EasyWorship profile or open it under **ย้ายคลังสื่อ EasyWorship**. The importer preserves the clip name, disc, title, chapter, tracks, playback marks, volume, mute, aspect setting, embedded JPEG thumbnail, and available author, copyright, description and tags. Native `.ewsx` schedules and presentation layouts retain DVD references and each element's playback settings. Importing a schedule also adds its clips to the local DVD catalog. [EasyWorship DVD clip workflows](https://support.easyworship.com/support/solutions/articles/24000020395-creating-and-using-dvd-clips)

In **คลังสื่อ → คลิป DVD**, open **อ่านคลิปจากแผ่นหรือโฟลเดอร์ DVD** in WorshipTeam Desktop, then choose **สำรวจแผ่น DVD**. Pick the mounted DVD-Video volume or its `VIDEO_TS` directory. The form lists the disc's titles, chapters and available angles, and shows audio and subtitle languages for the selected chapter. It starts with the saved EasyWorship values when available and flags values outside the selected disc's inventory. Choose **นำเข้าจากแผ่นที่เลือก** to convert the segment to MP4, save it in the media library, and match it to the clip. Use the audience display to check the original clip's marks before a service. Manual entry remains available through **ใช้หมายเลขเอง**. [DVD-Video title and chapter structure](https://dev.ecma-international.org/wp-content/uploads/ECMA_TR-71_1st_edition_february_1998.pdf) · [FFmpeg DVD-Video documentation](https://www.ffmpeg.org/ffmpeg-formats.html#dvdvideo)

Choose **ดูตัวอย่างก่อนนำเข้า** to prepare the MP4 and review it on the control screen. The preview starts with the saved EasyWorship marks when they fit the selected segment. Use **ดูเฉพาะช่วงที่บันทึกไว้** to switch between that range and the entire converted video. **บันทึกวิดีโอนี้** saves the previewed file directly. **กลับไปเลือกช่วง** discards the staged video before any media or clip assignment is saved. [EasyWorship DVD preview and markings](https://support.easyworship.com/support/solutions/articles/24000020650-dvd-layout)

Set **แทร็กคำบรรยาย DVD** to the track number you want to keep in the MP4. The number starts at 1 in WorshipTeam. A saved EasyWorship index of `0` can mean the first track or no active subtitle, so choose track 1 if the original clip showed it. The converter keeps the track's original bitmap, palette, position and timing for the title's native aspect. A portable `.wtschedule` carries both the resulting video and the track choice. Convert the clip again to change or remove its subtitles. Subtitle conversion requires FFmpeg's `dvdsub` decoder and `overlay` filter. [FFmpeg DVD subtitle documentation](https://ffmpeg.org/ffmpeg-codecs.html#dvdsub)

Desktop conversion reads unencrypted DVD-Video and requires an installed FFmpeg with the `dvdvideo` demuxer, AAC and either `libx264` or `h264_videotoolbox`. Run `ffmpeg -demuxers` to check for `dvdvideo`. Set `WORSHIP_DVD_FFMPEG` to the absolute path of the executable before starting Desktop if it is outside `PATH`. [FFmpeg DVD-Video documentation](https://www.ffmpeg.org/ffmpeg-formats.html#dvdvideo)

Use **สร้างคลิป DVD** or **แก้ไขคลิป** to preview a video, mark the current start and end, capture a thumbnail from the current frame, and choose repeat, volume, mute, and aspect. You can convert a disc or choose an existing video from the media library. Re-import fills missing source thumbnails and playback settings and keeps local edits. Newly added playlist cues carry a snapshot of the saved playback settings. [EasyWorship DVD editor documentation](https://support.easyworship.com/support/solutions/articles/24000020650-dvd-layout)

Choose **ใช้ช่วงที่บันทึกไว้** when the replacement video uses the same timeline as the clip. Leave it unchecked for a video that is already trimmed. Choose **บันทึกการจับคู่วิดีโอ** to reuse the assignment for matching cues on this computer. Opening a portable `.wtschedule` restores DVD definitions in the local catalog and matches new clips to their packed video. Positioned DVD layers play their configured audio on the audience output and on NDI outputs with cue audio enabled. The stage and alpha key remain silent.

### Importing EasyWorship presentations and themes

1. Apply the migrations through [EasyWorship slide collection metadata](supabase/migrations/20261124003940_backfill_design_collection_metadata.sql).
2. Copy the profile folder with `PresentationLayouts.db` and its `Resources` folder. Keep `Presentations.db` and `Themes.db` next to the layout database to retain their catalog metadata. For legacy backgrounds, keep `BackGrounds.DB` and `BackGrounds.MB` together with any original media in `Resources`. ZIP-compatible profiles also work. [EasyWorship profile guide](https://support.easyworship.com/support/solutions/articles/24000020412-profiles)
3. Open **สไลด์ → ย้ายงานนำเสนอและธีม EasyWorship**. Choose the source, click **ตรวจงานนำเสนอและธีม**, and select which entries to save.
4. Select a saved presentation to preview its slides, display it live, or add it to a playlist. Select a song or scripture theme and a matching playlist item to apply the theme.

For individual EasyWorship exports, choose **งานนำเสนอหรือธีม** in the same panel. Select one or more `.ewpx` presentations and `.ewtx` song, Scripture, or presentation themes, then review the slides and any file warnings. The selected designs and their packed media enter the slide library. A repeated export with the same native ID keeps its existing library record. Re-import a complete copy to recover missing media whose SHA-256 matches the saved reference. [EasyWorship presentation export guide](https://supportresources.easyworship.com/EasyWorship7Manual.pdf#page=278) · [EasyWorship theme exports](https://support.easyworship.com/support/solutions/articles/24000020403-about-themes)

The importer preserves slide order, supported text and media placement, fills, and verified advance timing. Native RTF text retains character colors, bold, italic, underline, and relative font sizes within a text box. Font families display when installed on the presentation machine. Linked song layouts can retain formatting across matching wrapped lyric lines. The same file keeps its import identity, so earlier saved designs and schedules retain their edits. The importer also matches PowerPoint file names and aliases in `Presentations.db` to files in the same profile's `Resources`. Native layouts without a source aspect ratio use 16:9. Design records and playlist snapshots follow the app's shared library access in Supabase. Design media bytes stay in this browser. [EasyWorship presentation workflows](https://support.easyworship.com/support/solutions/articles/24000020400-creating-editing-a-presentation) · [EasyWorship themes](https://support.easyworship.com/support/solutions/articles/24000020894-using-themes)

Imported EasyWorship presentations and themes preserve left, center and right paragraph alignment, individual text-box margins and the saved fixed or automatic sizing option. Reviewing and importing the same profile again can refresh these fields on existing text boxes while retaining local text and layout edits.

SQLite layouts and `.ewsx` schedules carry saved rotation on text, fills, and positioned media layers. Re-import the same source to fill a missing angle on a matching saved frame. A saved angle of zero stays in place. For a schedule previously appended to a playlist, select the batch to repair. [EasyWorship element rotation](https://support.easyworship.com/support/solutions/articles/24000071696-shapes)

The importer reads saved DrawingML contours for custom shapes, including rounded corners, straight segments, elliptical arcs and Bézier curves. The contour clips the layer's fill, text or media. Re-import to recover a missing contour on a matching layer. Both `.wtlibrary` and `.wtschedule` carry the recovered shapes. Unsupported geometry falls back to a rectangle with a warning. [EasyWorship shapes](https://support.easyworship.com/support/solutions/articles/24000071696-shapes) · [DrawingML custom geometry](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.customgeometry)

DrawingML paths keep their fill order, normal and shaded areas, and stroke flags. Shapes can have an open stroke or a stroke with no fill. A solid fill uses the saved relative lightness, and image and video shades scale the decoded color channels. Re-import fills missing path styles when the saved contour matches. Both portable package formats retain them. [DrawingML path fill modes](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.pathfillmodevalues?view=openxml-3.0.1)

Single-line element borders keep the saved color, opacity, width, position, and corner join. The line follows the shape and its rotation, including for frames with no fill. Width scales with slide height using a 1080-pixel reference. Re-import fills a missing border on a matching frame and respects a stored disabled border. The import review flags unrecognized border style values. [EasyWorship Inspector](https://support.easyworship.com/support/solutions/articles/24000020399-inspector)

Element shadows carry the saved color, opacity, direction, distance, and blur. The renderer casts one shadow from the combined fill, text or media, and border. It uses a CSS drop shadow with distance and blur scaled against a 1080-pixel slide reference. Re-import a profile or schedule to fill missing shadows on matching layers, or select the appended batch to repair. Both portable formats retain the shadow settings. [EasyWorship shapes](https://support.easyworship.com/support/solutions/articles/24000071696-shapes) · [CSS filter effects](https://www.w3.org/TR/filter-effects/)

Element reflections preserve the saved fade length, opacity, distance, and blur. The reflection flips the combined element below its frame and uses the same decoded video frame as the original. Distance and blur scale with slide height using a 1080-pixel reference. Re-import the profile or schedule to recover missing reflections on matching layers, or choose the appended batch to repair. `.wtlibrary` and `.wtschedule` retain the settings. [EasyWorship shapes](https://support.easyworship.com/support/solutions/articles/24000071696-shapes)

In the slide editor, select **กรอบที่จะแก้ไข** and open **เอฟเฟ็กต์กรอบที่เลือก** below the preview. Turn on the border, shadow, or reflection and adjust its settings. The same controls are available for positioned playlist slides and in the song layout editor. Use the song's main layout to change every lyric slide, or apply changes to the selected slide. Saved effects follow the lyric frame on a dedicated broadcast theme. The package formats retain effects authored in the editor.

Use **เพิ่มรูปทรง** to add one of 12 shapes in a library presentation, a presentation slide in a playlist, or a song layout. Open **รูปทรงกรอบที่เลือก** to adjust a preset's shape, rotation, opacity, or fill. Fills can use a solid color, a gradient, a library image or video, or transparency. Add text inside a shape and move, resize, or reorder the two together. To try a preset on an imported presentation frame, choose it in the same control. **รูปทรงเดิม** makes the saved EasyWorship contour visible again. Both portable backup formats carry the authored shape settings.

New imports preserve RTF left, right and first-line indentation, spacing before and after a paragraph, and saved line spacing. The importer reads these settings from native layouts and `.ewsx` slides. It also reads them from `SongWords.db` for songs without a matching layout. Soft line breaks remain inside the paragraph, including after splitting a song slide. Portable backups carry the paragraph settings. [EasyWorship presentation editor](https://help.easyworship.com/EditingPresentations.html) · [Microsoft RTF paragraph properties](https://learn.microsoft.com/en-us/windows/win32/controls/about-text-object-model)

The EasyWorship importer keeps native bullets, numbered and lettered lists, Roman numerals, nesting levels, and saved starting numbers. It also reads rendered markers in standard RTF list groups. Select text or place the caret in a paragraph, then open **รูปแบบย่อหน้า** and use **รูปแบบรายการ** to change its marker. The lyrics, chords, and search text stay intact. Re-import can restore missing markers on matching paragraphs and keeps an explicitly removed marker. `.wtlibrary` and `.wtschedule` carry the list settings. [EasyWorship bullet controls](https://easyworship.com/blog/individual-song-settings-in-easyworship)

New imports of SQLite presentations and `.ewsx` schedules retain slide transition settings and follow linked master layouts. The audience and broadcast displays play Blend, Cover, Reveal, Push, Wipe, Iris, Cube, Drop, Hex Tile and Page Flip. Use a playlist item or presentation editor to change effect, duration, direction, speed curve, or the applicable effect settings. Wipe and Iris support variable edge softness and use a hard edge at 0%. The displays apply supported EasyWorship `Ramp` values with browser easing curves. Drop and Page Flip support fade controls. Cube uses the saved retreat and background brightness. Page Flip uses the saved transparency on the turning page. Unsupported effects retain their source settings and play as a cut. Browsers without view transitions switch slides immediately. The browser's reduced-motion setting uses a short crossfade. [EasyWorship transition and slide timing](https://support.easyworship.com/support/solutions/articles/24000020392-creating-announcement-loops-in-easyworship) · [CSS View Transitions](https://www.w3.org/TR/css-view-transitions-1/)

Re-import the same `PresentationLayouts.db` with its media to fill missing effects and advance settings in library presentations or themes. The importer matches the original slide IDs, so renamed or reordered slides keep their edits. It respects saved timing and an explicit **ตามธีมที่ใช้** choice. A matching imported default output theme can also recover its effects when you re-import the profile. The import summary and profile CSV report the number of slides updated.

The same imports carry over manual and timed advance, advance after media, looping the current slide, and starting media from the beginning. Edit these in the playlist item or presentation editor. Open the audience presenter for media-based advance. It reports when its sound and video have finished, then the controller waits for the configured delay and advances. When a required file fails to play, the controller holds the current slide for manual control. [EasyWorship announcement loops](https://support.easyworship.com/support/solutions/articles/24000020392-creating-announcement-loops-in-easyworship)

The SQLite importer preserves Mark In and Mark Out from `Media.db`, presentation layouts, and packed `.ewsx` audio and video. Preview, audience, broadcast and stage playback use the stored segment. Loops return to Mark In, and media-based advance counts Mark Out as the end. In **คลังสื่อ**, choose **แก้ช่วงเล่น** to enter times in seconds or take either mark from the preview. Re-import refreshes the catalog marks on items that use the imported values and keeps local trim edits. A playlist entry saves its own copy of the selected range when you add the media or set its background. [EasyWorship video clip properties](https://help.easyworship.com/EditingVideos.html)

`Media.db` imports also preserve volume, mute, repeat, image and video aspect ratios, and background or foreground usage for visual media. In the media library, open **การเล่นบนจอ** to edit them. Background usage stretches visual media to the frame and loops video by default. Foreground usage keeps the original proportions and plays video once by default. An explicit aspect ratio or repeat setting takes precedence. Existing items gain newly supported settings on re-import and keep local edits. Newly added cues and backgrounds save a copy of the resolved settings. [EasyWorship image properties](https://help.easyworship.com/EditingImages.html) · [EasyWorship video properties](https://help.easyworship.com/EditingVideos.html)

Importing the same SQLite schedule or profile again fills missing settings on matching slides, including image aspect ratios stored on native elements. In a playlist with appended schedules, select the existing batch to recover. The library backup carries the catalog and saved cue settings.

`Media.db` also carries each video's selected thumbnail position. Select the video in **คลังสื่อ** to see the still under **ภาพตัวอย่างวิดีโอ**. Scrub the player and choose **ใช้เฟรมปัจจุบัน** to set a new one, or choose **ล้างภาพตัวอย่าง** to clear it. Re-import preserves both local choices. Native `.ewsx` schedules and SQLite presentation layouts also retain the selected frame on each video. To see it in a schedule, enable **ดูตัวอย่างก่อนขึ้นจอ** and select the item. Both `.wtschedule` and `.wtlibrary` preserve the frame positions. Playback uses the clip's Mark In and Mark Out. [EasyWorship video thumbnails](https://support.easyworship.com/support/solutions/articles/24000020404-videos)

Legacy solid, gradient, and available image or video backgrounds become editable **ธีมเพลงและพระคัมภีร์**. Their text slots preserve supported legacy font, color, alignment and margin overrides. Text shrinks when needed to fit the imported frame. The app uses a 16:9 canvas for these presets because the background table contains no canvas ratio. Select a theme and a song or scripture item to save a snapshot in that playlist. Existing databases need the [shared text themes migration](supabase/migrations/20261123053400_shared_text_themes.sql).

### Migrating song and presentation soundtracks

Include `PresentationLayouts.db`, the song or presentation catalog, and `Resources/Audio` in the profile import. The importer follows the source slide's audio and its linked master. It uses the file's explicit catalog usage when available and preserves repeat and trim marks. A background track continues between slides that share it. A foreground track starts from Mark In when the slide goes live. Song and slide libraries play the sound through the audience window. Adding a presentation to a playlist carries its soundtrack with it. [EasyWorship background audio](https://support.easyworship.com/support/solutions/articles/24000020405-add-background-audio-to-songs-presentations)

In the slide editor, open **เสียงประกอบสไลด์** to choose a track, change its playback mode, or apply the primary track to all slides. The audience plays one soundtrack per slide. Browsers may require a click in the audience window before playing sound. The media bytes stay in the presentation browser's library.

### Importing PowerPoint

1. Open **สไลด์ → นำเข้า PowerPoint** and choose a `.pptx`, or choose an original `.ppt` in WorshipTeam Desktop with LibreOffice Impress installed. Review the slide count and conversion details, then click **นำเข้าสไลด์ PowerPoint**. On a browser-only setup, save an older deck as `.pptx` first.
2. In Desktop, Impress can render slides containing charts, connectors, complex shapes, or unsupported table formatting as still images. This also works for PowerPoint decks recovered through EasyWorship schedules and profiles. The review identifies the slide numbers and reports conversion problems. [LibreOffice Impress export options](https://help.libreoffice.org/latest/en-GB/text/shared/guide/pdf_params.html?DbPAR=IMPRESS&System=UNIX)
3. Re-import the same source in Desktop to fill rendered graphics on unchanged slides. The import keeps local slide labels, order, and timing. Attaching a missing deck can replace untouched PowerPoint placeholders or cached slides. The importer can create a separate playlist if the existing placeholders were edited or a different deck was saved there. For an exact image exported by PowerPoint, import its PNGs under **นำเข้าชุดภาพที่ส่งออกจาก PowerPoint**. [EasyWorship image-export workflow](https://support.easyworship.com/support/solutions/articles/24000020419-create-easyworship-presentation-from-powerpoint-)

Start WorshipTeam Desktop with `npm --prefix desktop start -- --url <WorshipTeam URL>` after running `npm ci --prefix desktop`. Desktop checks the usual LibreOffice installation path and the system `PATH`. For a custom installation, set `WORSHIP_POWERPOINT_SOFFICE` to the LibreOffice executable before starting Desktop. LibreOffice converts the deck locally, and the importer uses the original `.ppt` to identify it on repeat imports. [LibreOffice conversion documentation](https://help.libreoffice.org/latest/en-GB/text/shared/guide/start_parameters.html)

Editable import supports slide order and aspect ratio, common text formatting, simple shapes, fills, and embedded raster images including crop. For editable slides with supported PowerPoint click builds, the projector opens at the initial state. **ถัดไปหนึ่งขั้น** and **ย้อนหนึ่งขั้น** show or hide each group of shapes before moving to another slide. These steps keep the source slide count and numbering. Re-import the same deck, schedule, or profile to restore a missing build when the referenced layers still exist. [Microsoft PowerPoint visibility behavior](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.setbehavior?view=openxml-2.20.0)

Tables preserve column widths, row heights, merged cells, margins, and supported fills, borders, and text formatting. Cell text can be edited in the slide editor. Embedded cell pictures and styles stored in the PowerPoint file travel with the imported slides. Re-import the original deck or EasyWorship schedule to restore tables that were missing from earlier editable slides. [DrawingML table cells](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.tablecell)

PowerPoint speaker notes import as plain text with their paragraph breaks. They travel with the slide in library and playlist backups. Re-import the same deck or EasyWorship schedule to fill missing notes on matching slides. A saved edit or deliberate clearing is kept. [PresentationML notes slides](https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-notes-slides)

PowerPoint imports Cut, Fade, Fade through Black, Push, Wipe, Cover, Pull, Circle, and the standard outward Prism as a rotating cube. The importer reads saved durations and automatic advance times from the direct transition or the PowerPoint compatibility block. Older files that store only a speed use approximate durations. If the file provides a supported fallback, review lists the substitution. Re-import the original deck to fill missing playback settings on the same slides. The editor keeps explicit local timing and theme choices. [PowerPoint transition format](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-pptx/99b95b35-568a-4652-9cba-df3d1175952f)

PowerPoint transition sounds play when a slide goes live. A looping sound continues across slides until another transition sound starts, a stop command runs, or the operator leaves the deck. Include the original file when a transition sound is linked to a file on another computer. Re-import the same deck or EasyWorship schedule to restore missing transition sounds on matching slides. [PowerPoint sound start](https://learn.microsoft.com/en-au/dotnet/api/documentformat.openxml.presentation.startsoundaction) · [PowerPoint sound stop](https://learn.microsoft.com/en-ca/dotnet/api/documentformat.openxml.presentation.endsoundaction)

PowerPoint video and audio use the saved files, volume, and trim points. Supported automatic starts play when the slide goes live. Use **ถัดไปหนึ่งขั้น** to follow the imported click sequence. Media starts can sit between shape changes or share a step with a shape. Videos or audio triggered by clicking the media object have their own step after the main sequence. If several audio tracks start on the same slide, the most recently started track plays as the slide soundtrack. Re-import the same PowerPoint file or EasyWorship schedule to recover the sequence on earlier imports. [PowerPoint click sequence](https://support.microsoft.com/en-us/powerpoint/insert-and-play-a-video-file-from-your-computer) · [PowerPoint media trims](https://learn.microsoft.com/en-nz/openspecs/office_standards/ms-pptx/c835eea3-fd6f-4055-8a57-92b193b7b2e3)

For PowerPoint links to files on an old drive, network share, or relative folder, include the original files in the selected EasyWorship profile’s `Resources`, or attach them in the PowerPoint or schedule review. The importer uses the filename and matching folders and reports conflicting copies. When a packed schedule records a checksum for the linked asset, the file must agree with it. Re-import to fill missing files on matching slides. Unresolved links keep their poster when available. [PowerPoint linked media relationships](https://learn.microsoft.com/en-nz/openspecs/office_standards/ms-pptx/f8b7e1cb-976e-4f38-8139-f9e5ffa826e8) · [EasyWorship profile transfer](https://support.easyworship.com/support/solutions/articles/24000043114-transfer-easyworship-profile)

YouTube and Vimeo videos imported from PowerPoint keep their original frame, poster, and supported link start time. Advance with **ถัดไปหนึ่งขั้น** to open the video on the audience display. If the browser waits for interaction, use the player’s Play button on that display. Preview, broadcast, stage, and NDI use the saved slide artwork. Online video requires internet access and provider permission to embed the clip. Portable backups keep the player link and poster. [PowerPoint online video](https://support.microsoft.com/en-gb/powerpoint/training/insert-a-video-from-youtube-or-another-site) · [YouTube player parameters](https://developers.google.com/youtube/player_parameters) · [Vimeo start time](https://help.vimeo.com/hc/en-us/articles/12425821012497-Start-playback-at-a-specific-timecode)

The importer presents supported entrance and exit effects as immediate visibility changes. Timed animations, motion, and per-paragraph builds still require separate playback support. Rendered graphics reflect Impress’s interpretation and the fonts available on the computer. Export `.wtschedule` or `.wtlibrary` with local media to move editable slides, click builds, rendered graphics, and embedded media to another browser.

---

## 📱 Screenshots

*Songs Library* | *Song Editor with Chord Dragging* | *Live Presentation*
:---:|:---:|:---:

---

## 📄 License

MIT
