/** Verifies native audio bindings and conversion into playable schedule cues. */

import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'
import { readEasyWorshipLayouts } from './easyWorshipDesigns'
import { getPlaylistSlides } from './playlistCues'
import { librarySoundtrack } from './presentationChannel'
import { presentationCue } from './slideDesign'
import type { PlaylistSong } from '../types/database'

describe('EasyWorship library soundtracks', () => {
  it('inherits audio through the master layout and respects local audio and hidden overrides', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    try {
      db.run(`
        CREATE TABLE presentation (presentation_type INTEGER, title TEXT);
        CREATE TABLE slide (presentation_id INTEGER, slide_uid TEXT, order_index INTEGER, theme_id INTEGER, theme_slide_uid TEXT);
        CREATE TABLE element (slide_id INTEGER, order_index INTEGER, element_uid TEXT, foreground_resource_id INTEGER);
        CREATE TABLE resource_audio (resource_id INTEGER, original_filename TEXT, start_pos INTEGER, end_pos INTEGER, repeating INTEGER);
        CREATE TABLE resource_text (resource_id INTEGER, rtf TEXT);
        CREATE TABLE element_property_group (link_id INTEGER, group_name TEXT);
        CREATE TABLE element_property (group_id INTEGER, key TEXT, value TEXT);
        INSERT INTO presentation VALUES (8,'Test announcement'), (12,'Theme');
        INSERT INTO slide VALUES (1,'first',0,2,'TITLE'), (1,'second',1,2,'TITLE'), (1,'third',2,2,'TITLE'), (1,'fourth',3,2,'TITLE');
        INSERT INTO slide VALUES (2,'TITLE',1,0,'MASTER'), (2,'MASTER',0,0,NULL);
        INSERT INTO element VALUES (1,0,'AUDIO',NULL),(2,0,'AUDIO',NULL),(3,0,'AUDIO',52),(4,0,'AUDIO',NULL),(6,0,'AUDIO',51);
        INSERT INTO resource_audio VALUES (51,'<audio>Master Track.wav',2000000,44000000,1),(52,'<audio>Local Track.wav',-1,-1,0);
        INSERT INTO element_property_group VALUES (4,'Element');
        INSERT INTO element_property VALUES (1,'Hidden','1');
      `)
      const result = readEasyWorshipLayouts(db, {
        resolveAsset: (_kind, file) => ({
          sourcePath: 'Resources/Audio/' + file.replace(/^<audio>/, ''),
          audioRole: file.includes('Local') ? 'foreground' : undefined,
        }),
      })
      const { content } = result.entries[0]
      const [first, second, third, fourth] = content.slides
      expect(first.design.soundtracks).toEqual([{
        kind: 'audio', filename: 'Master Track.wav', role: 'background', repeat: true,
        sourcePath: 'Resources/Audio/Master Track.wav', clip: { startSeconds: 0.2, endSeconds: 4.4 },
      }])
      expect(second.design.soundtracks).toEqual(first.design.soundtracks)
      expect(third.design.soundtracks).toMatchObject([{ filename: 'Local Track.wav', role: 'foreground' }])
      expect(fourth.design.soundtracks).toBeUndefined()
      const cue = presentationCue({ id: 'announcement', title: 'Test', kind: 'presentation', content, created_at: '' })
      expect(cue.slides[0].design?.soundtracks).toBeUndefined()
      expect(cue.slides[0].assets).toEqual([{
        kind: 'audio', filename: 'Master Track.wav', role: 'background', repeat: true, clip: { startSeconds: 0.2, endSeconds: 4.4 },
      }])
      const blocks = getPlaylistSlides({ id: 'entry', cue } as PlaylistSong, 4)
      expect(blocks[2].assets).toMatchObject([{ filename: 'Local Track.wav', role: 'foreground' }])
    } finally {
      db.close()
    }
  })

  it('retains a library playback identity across slides for backgrounds and restarts foregrounds', () => {
    const master = [{ kind: 'audio', filename: 'Track.wav', libraryId: 'track-id', role: 'background' }] as const
    const a = librarySoundtrack([...master], 'song-1')
    const b = librarySoundtrack([...master], 'song-1')
    expect(a?.runId).toEqual(b?.runId)
    expect(librarySoundtrack([...master], 'song-2')?.runId).not.toEqual(a?.runId)
    const foreground = [{ ...master[0], role: 'foreground' }] as const
    expect(librarySoundtrack([...foreground], 'song-1')?.runId)
      .not.toEqual(librarySoundtrack([...foreground], 'song-1')?.runId)
  })
})
