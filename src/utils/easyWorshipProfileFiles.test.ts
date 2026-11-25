/** Profile boundary and lazy-descriptor coverage for unified EasyWorship discovery. */

import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { describe, expect, it } from 'vitest'
import { attachEasyWorshipProfileResources, attachEasyWorshipProfileSchedules, createEasyWorshipProfileFiles, withProfileMedia } from './easyWorshipProfileFiles'

function fixture(path: string, contents = 'fixture'): File {
  const file = new File([contents], path.split('/').pop() ?? path)
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

describe('createEasyWorshipProfileFiles', () => {
  it('keeps Data and Resources scoped to their discovered profile and exposes lazy schedules and Bibles', async () => {
    const files = await createEasyWorshipProfileFiles([
      fixture('Alpha/Data/Songs.db'), fixture('Alpha/Data/SongWords.db'), fixture('Alpha/Resources/Schedules/service.ewsx'), fixture('Alpha/Bibles/KJV.ewb'),
      fixture('Beta/Databases/Data/Media.db'), fixture('Beta/Databases/Data/PresentationLayouts.db'), fixture('Beta/Resources/Schedules/other.ewsx'),
      fixture('Beta/Resources/Schedules/OLD.EWS'),
    ])
    expect(files.profiles).toHaveLength(2)
    const alpha = files.profiles.find((profile) => profile.name === 'Alpha')!
    const beta = files.profiles.find((profile) => profile.name === 'Beta')!
    expect(alpha.files).toMatchObject({ songs: 'Alpha/Data/Songs.db', songWords: 'Alpha/Data/SongWords.db' })
    expect(alpha.schedules.map((item) => item.filename)).toEqual(['service.ewsx'])
    expect(alpha.bibles.map((item) => item.filename)).toEqual(['KJV.ewb'])
    expect(beta.files.media).toBe('Beta/Databases/Data/Media.db')
    expect(beta.schedules.map((item) => item.filename)).toEqual(['other.ewsx', 'OLD.EWS'])
    expect(await alpha.schedules[0].readFile()).toBeInstanceOf(File)
  })

  it('preserves distinct nested profiles and refuses reads outside the selected profile', async () => {
    const files = await createEasyWorshipProfileFiles([
      fixture('Databases/Data/Media.db'),
      fixture('Resources/Audio/test.wav'),
      fixture('Mock/วัดหนึ่ง/Data/Presentations.db'),
      fixture('Mock/วัดหนึ่ง/Resources/Presentations/nested.pptx'),
      fixture('Mock/วัดสอง/Data/Media.db'),
      fixture('Mock/วัดสอง/Bibles/test.ewb'),
      fixture('Unrelated/Data/notes.txt'),
    ])
    expect(files.profiles).toHaveLength(3)
    const outer = files.profiles.find((profile) => profile.dataPath === 'Databases/Data/')
    const nested = files.profiles.find((profile) => profile.name === 'Mock/วัดหนึ่ง')
    expect(outer?.rootPath).toBe('')
    expect(outer?.bibles).toEqual([])
    expect(nested?.files.presentations).toBe('Mock/วัดหนึ่ง/Data/Presentations.db')
    await expect(files.forProfile(outer!.id).read('Mock/วัดหนึ่ง/Resources/Presentations/nested.pptx')).rejects.toThrow('นอกโปรไฟล์')
    await expect(files.forProfile(outer!.id).read('Resources/Audio/test.wav')).resolves.toBeInstanceOf(File)
    const source = files.forProfile(outer!.id)
    await expect(withProfileMedia(source, 'Mock/วัดหนึ่ง/Resources/Presentations/nested.pptx', (file) => file.text()))
      .rejects.toThrow('นอกโปรไฟล์')
    await expect(withProfileMedia(source, 'Resources/Audio/test.wav', (file) => file.text())).resolves.toBe('fixture')
  })

  it('adds loose schedules lazily without merging identically named files or changing the other profile', async () => {
    const files = await createEasyWorshipProfileFiles([
      fixture('Main/Data/Songs.db'), fixture('Main/Resources/Schedules/Sunday.ewsx', 'packed'),
      fixture('Youth/Data/Media.db'), fixture('Youth/Sunday.ewsx', 'youth'),
    ])
    const [main, youth] = files.profiles
    const separate = fixture('Sunday.ewsx', 'separate')
    const legacy = fixture('Sunday.EWS', 'legacy')
    const updated = attachEasyWorshipProfileSchedules(files, main.id, [separate, legacy, fixture('Sunday.txt')])
    const schedules = updated.profiles[0].schedules
    expect(schedules.map(({ filename, attached }) => [filename, attached])).toEqual([
      ['Sunday.ewsx', undefined], ['Sunday.ewsx', true], ['Sunday.EWS', true],
    ])
    expect(new Set(schedules.map(({ path }) => path)).size).toBe(3)
    await expect(schedules[1].readFile()).resolves.toBe(separate)
    await expect(schedules[2].readFile()).resolves.toBe(legacy)
    expect(updated.profiles[0].warnings[0]).toContain('Sunday.txt')
    expect(updated.profiles[1]).toBe(youth)
    expect(main.schedules).toHaveLength(1)
    expect(updated.forProfile(main.id)).toBe(files.forProfile(main.id))
  })

  it('joins the Windows v6.1 catalogs to sibling Resources without mixing catalog generations', async () => {
    const files = await createEasyWorshipProfileFiles([
      fixture('Default/V6.1/Databases/Data/Songs.db'),
      fixture('Default/V6.1/Databases/Data/SongHistory.db'),
      fixture('Default/V6.1/Databases/Data/Collections.db'),
      fixture('Default/V6.1/Databases/Data/SongWords.db'),
      fixture('Default/Databases/Data/Songs.DB'),
      fixture('Default/Databases/Data/Songs.MB'),
      fixture('Default/Resources/Images/sky.jpg'),
      fixture('Default/Resources/Schedules/sunday.ewsx'),
      fixture('Youth/v6.1/Databases/Data/Media.db'),
      fixture('Youth/Resources/Images/sky.jpg'),
    ])
    const modern = files.profiles.find((profile) => profile.dataPath.includes('V6.1'))!
    const legacy = files.profiles.find((profile) => profile.files.songMemo)!
    expect(modern).toMatchObject({
      rootPath: 'Default/',
      name: 'Default/V6.1/Databases/Data',
      files: {
        songs: 'Default/V6.1/Databases/Data/Songs.db',
        songHistory: 'Default/V6.1/Databases/Data/SongHistory.db',
        collections: 'Default/V6.1/Databases/Data/Collections.db',
        songWords: 'Default/V6.1/Databases/Data/SongWords.db',
      },
      schedules: [{ filename: 'sunday.ewsx' }],
    })
    expect(modern.files.songMemo).toBeUndefined()
    expect(legacy.files.songHistory).toBeUndefined()
    expect(legacy.files.collections).toBeUndefined()
    expect(legacy.files.songWords).toBeUndefined()
    const assets = files.forProfile(modern.id)
    await expect(assets.read('Default/Resources/Images/sky.jpg')).resolves.toBeInstanceOf(File)
    await expect(assets.read('Youth/Resources/Images/sky.jpg')).rejects.toThrow('นอกโปรไฟล์')
    await expect(assets.read('Default/Databases/Data/Songs.DB')).rejects.toThrow('นอกโปรไฟล์')
  })

  it('uses the manifest label for an exported profile while retaining its verified relative data paths', async () => {
    const zip = new ZipWriter(new BlobWriter())
    await zip.add('profiles/โบสถ์/Custom Data/v6.1/Databases/Data/Songs.db', new TextReader('fixture'))
    await zip.add('profiles/โบสถ์/Custom Data/Resources/Schedules/Service.ewsx', new TextReader('schedule'))
    await zip.add('manifest.json', new TextReader(JSON.stringify({
      version: '1.0', sourcePlatform: 'macOS',
      profiles: [
        { profileName: 'โบสถ์', ewVersionPretty: 'EasyWorship 8', hasResources: true },
        { profileName: 'Unmatched', ewVersionPretty: 'EasyWorship 7', hasResources: false },
      ],
    })))
    const files = await createEasyWorshipProfileFiles(new File([await zip.close()], 'profiles.ewprofile'))
    expect(files.profiles).toMatchObject([{
      name: 'โบสถ์',
      rootPath: 'profiles/โบสถ์/Custom Data/',
      transfer: { version: 'EasyWorship 8', includesResources: true },
      files: { songs: 'profiles/โบสถ์/Custom Data/v6.1/Databases/Data/Songs.db' },
      schedules: [{ filename: 'Service.ewsx' }],
    }])
  })

  it('reviews each dated database backup with shared media and keeps catalog pairs isolated', async () => {
    const root = 'profiles/โบสถ์/Default Data/'
    const current = root + 'V6.1/Databases/Data/'
    const first = root + 'V6.1/Databases/Archive/2025-03-06 7.4/'
    const second = root + 'V6.1/Databases/Archive/2025-06-08 7.4/'
    const media = root + 'Resources/Images/Sky.jpg'
    const schedule = root + 'Resources/Schedules/Today.ewsx'
    const settings = root + 'V6.1/Options/Default.ewo/Data/Foldback.Settings.db'
    const zip = new ZipWriter(new BlobWriter())
    const paths = [current + 'Songs.db', current + 'SongWords.db', first + 'Songs.db', first + 'SongWords.db',
      second + 'Songs.db', second + 'SongWords.db-wal', media, schedule, settings]
    for (const path of paths) await zip.add(path, new TextReader(path))
    await zip.add('manifest.json', new TextReader(JSON.stringify({
      version: '1.0', profiles: [{ profileName: 'โบสถ์', ewVersionPretty: 'EasyWorship 7', hasResources: true }],
    })))
    const files = await createEasyWorshipProfileFiles(new File([await zip.close()], 'sources.ewprofile'))
    const [live, march, june] = [current, first, second].map((path) => files.profiles.find(({ dataPath }) => dataPath === path)!)
    expect(live.name).toBe('โบสถ์')
    expect(live.schedules.map((item) => item.path)).toEqual([schedule])
    expect(live.optionSets).toHaveLength(1)
    expect(march).toMatchObject({
      name: 'โบสถ์ · ฐานข้อมูลย้อนหลัง 2025-03-06 7.4', rootPath: root,
      files: { songs: first + 'Songs.db', songWords: first + 'SongWords.db' },
      optionSets: [], schedules: [],
    })
    expect(june.files.songWords).toBeUndefined()
    expect(june.files.songs).toBe(second + 'Songs.db')
    await expect(files.forProfile(march.id).read(media).then((blob) => blob.text())).resolves.toBe(media)
    for (const outside of [current + 'Songs.db', second + 'SongWords.db-wal', settings, schedule]) {
      await expect(files.forProfile(march.id).read(outside)).rejects.toThrow('นอกโปรไฟล์')
    }
    await expect(files.forProfile(live.id).read(first + 'Songs.db')).rejects.toThrow('นอกโปรไฟล์')
  })

  it('returns a stored ZIP64 resource and still verifies its original CRC before returning the file', async () => {
    const zip = new ZipWriter(new BlobWriter(), { level: 0, zip64: true })
    await zip.add('Main/Data/Media.db', new TextReader('catalog'))
    const path = 'Main/Resources/Videos/example.mp4'
    const source = 'stored media bytes'
    const entry = await zip.add(path, new TextReader(source))
    const original = await zip.close()
    const sourceFiles = await createEasyWorshipProfileFiles(new File([original], 'source.ewprofile'))
    await expect(sourceFiles.file(sourceFiles.profiles[0].id, path).then((file) => file.text())).resolves.toBe(source)

    const bytes = new Uint8Array(await original.arrayBuffer())
    const marker = new TextEncoder().encode(source)
    const payload = bytes.findIndex((_, offset) => marker.every((byte, index) => bytes[offset + index] === byte))
    expect(payload).toBeGreaterThan(entry.offset)
    bytes[payload + 1] ^= 1
    const damaged = await createEasyWorshipProfileFiles(new File([bytes], 'damaged.ewprofile'))
    await expect(damaged.file(damaged.profiles[0].id, path)).rejects.toThrow(/CRC|signature/i)
  })

  it('uses the transfer descriptor to choose options from its own profile', async () => {
    const zip = new ZipWriter(new BlobWriter())
    await zip.add('profiles/Main/Main.ewp', new TextReader('[Profile]\nAppInstDataDir=C:\\Church\\Shared Data\nOptions=Sunday'))
    await zip.add('profiles/Main/Shared Data/v6.1/Databases/Data/Songs.db', new TextReader('fixture'))
    await zip.add('profiles/Main/Shared Data/v6.1/Options/Rehearsal.ewo/Data/Alerts.db', new TextReader('rehearsal'))
    await zip.add('profiles/Main/Shared Data/v6.1/Options/SUNDAY.ewo/Data/Live.Settings.db', new TextReader('sunday'))
    const messageStyle = 'profiles/Main/Shared Data/v6.1/Options/SUNDAY.ewo/Data/LiveMessage.Settings.db'
    await zip.add(messageStyle, new TextReader('audience message settings'))
    await zip.add('profiles/Youth/Youth.ewp', new TextReader('[Profile]\nOptions=Rehearsal'))
    await zip.add('profiles/Youth/Youth Data/v6.1/Databases/Data/Songs.db', new TextReader('fixture'))
    await zip.add('profiles/Youth/Youth Data/v6.1/Options/Rehearsal.ewo/Data/Alerts.db', new TextReader('youth'))
    const files = await createEasyWorshipProfileFiles(new File([await zip.close()], 'profiles.ewprofile'))
    expect(files.profiles[0]).toMatchObject({
      defaultOptionsId: 'v6.1/options/sunday.ewo',
      optionSets: [{ name: 'Rehearsal' }, { name: 'SUNDAY', messageStyleFiles: [messageStyle] }],
    })
    expect(files.profiles[1]).toMatchObject({
      defaultOptionsId: 'v6.1/options/rehearsal.ewo', optionSets: [{ name: 'Rehearsal' }],
    })
    expect(files.profiles[1].optionSets[0].messageStyleFiles).toBeUndefined()
  })

  it('leaves settings unselected when multiple sets exist without a descriptor or the named set is missing', async () => {
    const files = await createEasyWorshipProfileFiles([
      fixture('Main/Data/Songs.db'),
      fixture('Main/Options/Sunday.ewo/Data/Alerts.db'),
      fixture('Main/Options/Youth.ewo/Data/Live.Settings.db'),
      fixture('Youth/Youth.ewp', '[Profile]\nOptions=Missing'),
      fixture('Youth/Data/Songs.db'),
      fixture('Youth/Options/Default.ewo/Data/Alerts.db'),
    ])
    expect(files.profiles.filter((profile) => profile.defaultOptionsId)).toEqual([])
    expect(files.profiles[1].warnings).toContain('ไม่พบชุดตัวเลือก Missing ที่ระบุในไฟล์ .ewp')
  })

  it('matches a UTF-16 descriptor and scopes options to the selected catalog generation', async () => {
    const text = '\uFEFF[Profile]\r\nOptions="โบสถ์.ewo"\r\n'
    const data = new DataView(new ArrayBuffer(text.length * 2))
    for (let index = 0; index < text.length; index++) data.setUint16(index * 2, text.charCodeAt(index), true)
    const entry = new File([data.buffer], 'Main.ewp')
    Object.defineProperty(entry, 'webkitRelativePath', { value: 'Main/Main.ewp' })
    const files = await createEasyWorshipProfileFiles([
      entry,
      fixture('Main/Databases/Data/Songs.DB'),
      fixture('Main/Options/Old.ewo/Data/Alerts.db'),
      fixture('Main/v6.1/Databases/Data/Songs.db'),
      fixture('Main/v6.1/Options/โบสถ์.ewo/Data/Alerts.db'),
    ])
    expect(files.profiles[0]).toMatchObject({ optionSets: [{ name: 'Old', versioned: false }] })
    expect(files.profiles[0].defaultOptionsId).toBeUndefined()
    expect(files.profiles[1]).toMatchObject({
      optionSets: [{ name: 'โบสถ์', versioned: true }], defaultOptionsId: 'v6.1/options/โบสถ์.ewo',
    })
  })

  it('restores missing files only in the selected profile and keeps existing files ahead of the attachment', async () => {
    const source = await createEasyWorshipProfileFiles([
      fixture('Adult/v6.1/Databases/Data/Songs.db'),
      fixture('Adult/Resources/Images/Base.png', 'archive'),
      fixture('Youth/v6.1/Databases/Data/Songs.db'),
    ])
    const [adult, youth] = source.profiles
    const files = attachEasyWorshipProfileResources(source, adult.id, [
      fixture('Resources/Images/BASE.png', 'attached duplicate'),
      fixture('Resources/Audio/extra.wav', 'attached audio'),
      fixture('Resources/Schedules/Rehearsal.ewsx'),
      fixture('Resources/Bibles/KJV.ewb'),
      fixture('Resources/Images/../Media.db'),
    ])
    const [restored] = files.profiles
    expect(restored.schedules.map((item) => item.filename)).toEqual(['Rehearsal.ewsx'])
    expect(restored.bibles.map((item) => item.filename)).toEqual(['KJV.ewb'])
    await expect(restored.schedules[0].readFile()).resolves.toBeInstanceOf(File)
    await expect(files.file(adult.id, 'Adult/Resources/Images/Base.png').then((item) => item.text())).resolves.toBe('archive')
    const attachedAlternatives = files.forProfile(adult.id).hashOnlyMedia ?? []
    expect(attachedAlternatives).toHaveLength(1)
    const [alternative] = attachedAlternatives
    expect(files.forProfile(adult.id).paths.has(alternative.toLowerCase())).toBe(false)
    await expect(withProfileMedia(files.forProfile(adult.id), alternative, (item) => item.text())).resolves.toBe('attached duplicate')
    await expect(files.file(youth.id, alternative)).rejects.toThrow('นอกโปรไฟล์')
    await expect(files.file(adult.id, 'Adult/Resources/Audio/extra.wav').then((item) => item.text())).resolves.toBe('attached audio')
    await expect(files.file(youth.id, 'Youth/Resources/Audio/extra.wav')).rejects.toThrow('นอกโปรไฟล์')
    expect(source.profiles[0].schedules).toEqual([])
    expect(() => attachEasyWorshipProfileResources(source, adult.id, [fixture('Other/Audio/extra.wav')])).toThrow('เลือกโฟลเดอร์ Resources')
  })
})
