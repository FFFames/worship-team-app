/** Seed sample songs and playlists for first-time users */

import type { Song, Playlist, PlaylistSong, VideoBackground } from '../types/database'
import { parseChordLyrics } from './chordParser'

const STORAGE_KEYS = {
  songs: 'worshipteam_songs',
  playlists: 'worshipteam_playlists',
  playlistSongs: 'worshipteam_playlist_songs',
  backgrounds: 'worshipteam_backgrounds',
}

const now = () => new Date().toISOString()
const uuid = () => crypto.randomUUID()

/** Sample songs with chord charts */
const sampleSongs: Song[] = [
  {
    id: uuid(),
    title: 'Amazing Grace',
    artist: 'John Newton',
    original_key: 'G',
    content_raw: `G                    G7           C
Amazing grace how sweet the sound
G                                   D
That saved a wretch like me
G                    G7           C
I once was lost but now am found
G              D           G
Was blind but now I see

[Verse 2]
[G]'Twas grace that [G7]taught my [C]heart to fear
And [G]grace my fears re[D]lieved
How [G]precious did that [G7]grace ap[C]pear
The [G]hour I first be[D]lieved

[Chorus]
[G]Amazing grace how [D]sweet the [Em]sound
That [C]saved a wretch like [G]me
I [G]once was lost but [D]now am [Em]found
Was [C]blind but [D]now I [G]see`,
    content_parsed: { sections: [] },
    created_by: null,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: uuid(),
    title: 'How Great Thou Art',
    artist: 'Carl Boberg',
    original_key: 'G',
    content_raw: `[Verse 1]
[G]O Lord my God, when I in [C]awesome wonder
[G]Consider all the [D]worlds Thy [G]hands have made
[G]I see the stars, I hear the [C]rolling thunder
[G]Thy power throughout the [D]universe dis[G]played

[Chorus]
[C]Then sings my [G]soul, my [D]Savior God, to [G]Thee
[C]How great Thou [G]art, how [D]great Thou [G]art
[C]Then sings my [G]soul, my [D]Savior God, to [G]Thee
[G]How great Thou [D]art, how [G]great Thou [G]art`,
    content_parsed: { sections: [] },
    created_by: null,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: uuid(),
    title: '10,000 Reasons (Bless the Lord)',
    artist: 'Matt Redman',
    original_key: 'E',
    content_raw: `[Verse 1]
[E]Bless the Lord, O my [B/D#]soul
O my [G#m]soul
Worship His [C#m]holy name
[E]Sing like never be[B/D#]fore
O my [G#m]soul
I'll worship Your [C#m]holy name

[Chorus]
[A]You're worthy of [E]honor and [B]glory
[A]Bless the Lord, O my [E]soul
You are [B]worthy of [C#m]honor and [A]glory
[B]Bless the Lord, O my [E]soul

[Verse 2]
[B]Bless the Lord, O my [E]soul
O my [G#m]soul
Worship His [C#m]holy name
[E]Sing like never be[B/D#]fore
O my [G#m]soul
I'll worship Your [C#m]holy name`,
    content_parsed: { sections: [] },
    created_by: null,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: uuid(),
    title: 'Blessed Assurance',
    artist: 'Fanny Crosby',
    original_key: 'G',
    content_raw: `[Verse 1]
[G]Blessed as[B7]surance, Jesus is [C]mine
O what a fore[G]taste of [D]glory di[G]vine
[G]Heir of sal[B7]vation, purchase of [C]God
Born of His [G]Spirit, [D]washed in His [G]blood

[Chorus]
[C]This is my [G]story, this is my [D]song
[G]Praising my [B7]Savior all the [C]day long
[G]This is my [Em]story, this is my [G]song
[G]Praising my [D]Savior all the [G]day long

[Verse 2]
[G]Perfect sub[B7]mission, perfect de[C]light
Visions of [G]rapture now [D]burst on my [G]sight
[G]Angels de[B7]scending, bring from a[C]bove
Echoes of [G]mercy, [D]whispers of [G]love`,
    content_parsed: { sections: [] },
    created_by: null,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: uuid(),
    title: 'Holy, Holy, Holy',
    artist: 'Reginald Heber',
    original_key: 'G',
    content_raw: `[Verse 1]
[G]Holy, holy, ho[G7]ly! Lord God [C]Almighty
[G]Early in the [D]morning our [G]song shall [G7]rise to [C]Thee
[G]Holy, holy, ho[G7]ly! Merciful and [C]mighty
[G]Redeemer and [D]Friend of [Em]man, who [G]from be[D]fore [G]time be[G]gan

[Chorus]
[C]Holy, holy, [G]holy! Lord God [D]Almighty
[G]Holy, holy, [Em]holy! Lord God [C]Almighty
[C]Holy, holy, [G]holy! Lord God [D]Almighty
[G]Early in the [D]morning our [G]song shall [G]rise to [C]Thee`,
    content_parsed: { sections: [] },
    created_by: null,
    created_at: now(),
    updated_at: now(),
  },
]

/** Sample playlists */
const samplePlaylists: Playlist[] = [
  {
    id: uuid(),
    name: 'Sunday Service',
    description: 'Regular Sunday worship set',
    created_by: null,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: uuid(),
    name: 'Practice Session',
    description: 'Team rehearsal songs',
    created_by: null,
    created_at: now(),
    updated_at: now(),
  },
]

/** Sample playlist songs */
const samplePlaylistSongs = (playlists: Playlist[], songs: Song[]): PlaylistSong[] => {
  const sundayId = playlists[0].id
  const practiceId = playlists[1].id

  return [
    {
      id: uuid(),
      playlist_id: sundayId,
      song_id: songs[0].id, // Amazing Grace
      position: 0,
      transpose_semitones: 0,
    },
    {
      id: uuid(),
      playlist_id: sundayId,
      song_id: songs[1].id, // How Great Thou Art
      position: 1,
      transpose_semitones: 0,
    },
    {
      id: uuid(),
      playlist_id: sundayId,
      song_id: songs[2].id, // 10,000 Reasons
      position: 2,
      transpose_semitones: 0,
    },
    {
      id: uuid(),
      playlist_id: practiceId,
      song_id: songs[3].id, // Blessed Assurance
      position: 0,
      transpose_semitones: 0,
    },
    {
      id: uuid(),
      playlist_id: practiceId,
      song_id: songs[4].id, // Holy Holy Holy
      position: 1,
      transpose_semitones: 0,
    },
  ]
}

/** Sample video backgrounds */
const sampleBackgrounds: VideoBackground[] = [
  {
    id: uuid(),
    name: 'Blue Sky',
    url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
    is_default: true,
    created_at: now(),
  },
  {
    id: uuid(),
    name: 'Mountain View',
    url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
    is_default: false,
    created_at: now(),
  },
  {
    id: uuid(),
    name: 'Ocean Waves',
    url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
    is_default: false,
    created_at: now(),
  },
]

/** Check if data exists, seed if empty */
export function seedDataIfEmpty() {
  const existingSongs = localStorage.getItem(STORAGE_KEYS.songs)
  const existingPlaylists = localStorage.getItem(STORAGE_KEYS.playlists)

  if (!existingSongs && !existingPlaylists) {
    console.log('🌱 Seeding sample data...')

    // Seed songs
    const songsWithParsed = sampleSongs.map(song => ({
      ...song,
      content_parsed: parseChordLyrics(song.content_raw)
    }))
    localStorage.setItem(STORAGE_KEYS.songs, JSON.stringify(songsWithParsed))

    // Seed playlists
    localStorage.setItem(STORAGE_KEYS.playlists, JSON.stringify(samplePlaylists))

    // Seed playlist songs
    const playlistSongs = samplePlaylistSongs(samplePlaylists, sampleSongs)
    localStorage.setItem(STORAGE_KEYS.playlistSongs, JSON.stringify(playlistSongs))

    // Seed backgrounds
    localStorage.setItem(STORAGE_KEYS.backgrounds, JSON.stringify(sampleBackgrounds))

    console.log('✅ Sample data seeded successfully')
  }
}

/** Export storage keys for use by hooks */
export { STORAGE_KEYS }
