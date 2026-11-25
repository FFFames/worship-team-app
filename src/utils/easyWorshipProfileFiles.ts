/** Indexes an EasyWorship archive or folder and scopes file reads to one profile. */

import type { FileEntry } from '@zip.js/zip.js'
import type { MediaKind } from '../types/media'
import { readZipAsset, withZipAsset, type WithMediaBlob } from './zipAsset'

export type EasyWorshipLazyFile = {
  path: string
  filename: string
  kind: 'schedule' | 'bible'
  attached?: true
  readFile: () => Promise<File>
  withFile?: <T>(consume: (file: File) => Promise<T>) => Promise<T>
}
type WalRecoveryNotice = { path: string; recovered: boolean; ignoredDamagedTail: boolean }
export type EasyWorshipMediaReference = { kind: MediaKind; filename: string; hash: string; size?: number }
export type EasyWorshipProfileAssetSource = {
  paths: Map<string, string[]>
  attachedMedia?: readonly string[]
  attachedMediaLocations?: ReadonlyMap<string, string>
  /** Readable alternatives excluded from ordinary filename matching. */
  hashOnlyMedia?: readonly string[]
  findLibraryMedia?: (reference: EasyWorshipMediaReference) => Promise<string | undefined>
  read: (path: string, onWalRecovery?: (notice: WalRecoveryNotice) => void) => Promise<Blob>
  withMedia?: WithMediaBlob
  size: (path: string) => number | undefined
}

export function withProfileMedia<T>(
  source: Pick<EasyWorshipProfileAssetSource, 'read' | 'withMedia'>, path: string, consume: (blob: Blob) => Promise<T>,
): Promise<T> {
  return source.withMedia ? source.withMedia(path, consume) : source.read(path).then(consume)
}

const catalogKeys = {
  'songs.db': 'songs',
  'songwords.db': 'songWords',
  'songwords.dat': 'songWords',
  'songs.mb': 'songMemo',
  'songhistory.db': 'songHistory',
  'collections.db': 'collections',
  'media.db': 'media',
  'backgrounds.db': 'backgrounds',
  'backgrounds.mb': 'backgroundMemo',
  'presentationlayouts.db': 'layouts',
  'presentations.db': 'presentations',
  'themes.db': 'themes',
} as const
type CatalogKey = typeof catalogKeys[keyof typeof catalogKeys]
const MAX_DATABASE_BYTES = 128 * 1024 * 1024
const MAX_MANIFEST_BYTES = 256 * 1024
const MAX_PROFILE_DESCRIPTOR_BYTES = 64 * 1024
type TransferProfile = { name: string; version: string; includesResources: boolean }

export type EasyWorshipOptionSet = {
  id: string
  name: string
  versioned: boolean
  alertFile?: string
  serviceIntervalsFile?: string
  defaultThemeFiles: string[]
  nurseryStyleFiles?: string[]
  messageStyleFiles?: string[]
  foldbackAppearanceFile?: string
}

export type EasyWorshipProfileInventory = {
  id: string
  name: string
  rootPath: string
  dataPath: string
  archiveName?: string
  files: Partial<Record<CatalogKey, string>>
  schedules: EasyWorshipLazyFile[]
  bibles: EasyWorshipLazyFile[]
  optionSets: EasyWorshipOptionSet[]
  defaultOptionsId?: string
  warnings: string[]
  transfer?: TransferProfile
}

export type EasyWorshipProfileFiles = {
  profiles: EasyWorshipProfileInventory[]
  forProfile: (profileId: string) => EasyWorshipProfileAssetSource
  file: (profileId: string, path: string) => Promise<File>
}

function safePath(value: string): string | undefined {
  const path = value.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!path || path.startsWith('/') || /^[a-z]:/i.test(path) || path.includes('\0')
    || path.split('/').some((component) => !component || component === '.' || component === '..')) return undefined
  return path
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

export function easyWorshipWalWarning({ path, recovered, ignoredDamagedTail }: WalRecoveryNotice): string | undefined {
  const filename = basename(path)
  if (ignoredDamagedTail) return `${filename} · อ่านข้อมูลถึงการบันทึกสมบูรณ์ครั้งสุดท้าย เพราะส่วนท้ายไฟล์ WAL ไม่ครบหรือเสียหาย`
  if (recovered) return `${filename} · กู้ข้อมูลที่บันทึกแล้วจากไฟล์ WAL`
}

function catalogKey(path: string): CatalogKey | undefined {
  const name = basename(path).toLowerCase()
  return Object.prototype.hasOwnProperty.call(catalogKeys, name) ? catalogKeys[name as keyof typeof catalogKeys] : undefined
}

function databaseLimit(path: string): number | undefined {
  if (/\/(?:alerts|serviceintervals)\.db$/i.test(path)) return 32 * 1024 * 1024
  const field = catalogKey(path)
  if (field === 'songMemo' || field === 'backgroundMemo') return 4 * MAX_DATABASE_BYTES
  if (field || /\.ewb$/i.test(path)
    || /\/(?:live|alt|livenursery|altoutnursery|livemessage|altoutmessage|foldback|foldbackmessage)\.settings\.db$/i.test(path)) return MAX_DATABASE_BYTES
  return undefined
}

function profileFileKind(relative: string): EasyWorshipLazyFile['kind'] | undefined {
  const inRoot = !relative.includes('/')
  if (/\.ewsx?$/.test(relative) && (inRoot || /^(?:resources\/)?schedules\//.test(relative))) return 'schedule'
  if (relative.endsWith('.ewb') && (inRoot || /^(?:(?:resources|plugins)\/)?bibles\//.test(relative))) return 'bible'
  return undefined
}

function lazyProfileFile(path: string, kind: EasyWorshipLazyFile['kind'], read: EasyWorshipProfileAssetSource['read']): EasyWorshipLazyFile {
  const filename = basename(path)
  return { path, filename, kind, readFile: async () => new File([await read(path)], filename) }
}

function transferProfiles(value: unknown): TransferProfile[] {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== '1.0'
    || !('profiles' in value) || !Array.isArray(value.profiles)) return []

  return value.profiles.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || !('profileName' in entry) || !('ewVersionPretty' in entry) || !('hasResources' in entry)
      || typeof entry.profileName !== 'string' || typeof entry.ewVersionPretty !== 'string' || typeof entry.hasResources !== 'boolean') return []
    const name = entry.profileName.trim()
    const version = entry.ewVersionPretty.trim()
    if (!name || !version || name.length > 255 || version.length > 80) return []
    return [{ name, version, includesResources: entry.hasResources }]
  })
}

/** EasyWorship 6/7 store versioned databases alongside the profile's Resources directory. */
export function easyWorshipProfileRoot(dataPath: string): string {
  const archived = archivedCatalogPath.exec(dataPath)
  if (archived) return dataPath.slice(0, archived.index + Number(archived[0].startsWith('/')))
  return dataPath.replace(/(?:^|\/)(?:(?:v6\.1\/)?databases\/)?data\/$/i, (suffix) => suffix.startsWith('/') ? '/' : '')
}

const archivedCatalogPath = /(?:^|\/)(?:v6\.1\/)?databases\/archive\/([^/]+)\/$/i
const archivedCatalogPrefix = /^(?:v6\.1\/)?databases\/archive\//
const sharedArchiveMedia = /^resources\/(?:images|videos|audio|presentations)\//

export function easyWorshipArchiveName(dataPath: string): string | undefined {
  return archivedCatalogPath.exec(dataPath)?.[1]
}

type Locator = {
  path: string
  size: number
  read: () => Promise<Blob>
  withBlob?: <T>(consume: (blob: Blob) => Promise<T>) => Promise<T>
}

function optionNameKey(name: string): string {
  return name.normalize('NFC').toLowerCase()
}

async function readProfileOptions(entry: Locator): Promise<string | undefined> {
  if (entry.size > MAX_PROFILE_DESCRIPTOR_BYTES) throw new Error('ไฟล์ .ewp มีขนาดเกิน 64 KB')
  const bytes = new Uint8Array(await (await entry.read()).arrayBuffer())
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
    : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8'
  let inProfile = false
  for (const line of new TextDecoder(encoding).decode(bytes).split(/\r\n|[\r\n]/)) {
    const section = /^\s*\[([^\]]+)\]\s*$/.exec(line)
    if (section) inProfile = section[1].trim().toLowerCase() === 'profile'
    const value = inProfile ? /^\s*options\s*=\s*(.+?)\s*$/i.exec(line)?.[1] : undefined
    if (value) return value.replace(/^"([^"\r\n]+)"$/, '$1').replace(/\.ewo$/i, '').trim()
  }
}

async function selectDefaultOptions(profile: EasyWorshipProfileInventory, descriptors: Locator[]) {
  if (!profile.optionSets.length && !descriptors.length) return
  if (descriptors.length > 1) {
    profile.warnings.push('พบไฟล์ .ewp ชื่อเดียวกันหลายไฟล์ กรุณาเลือกชุดตัวเลือกของโปรไฟล์')
    return
  }
  const [descriptor] = descriptors
  let name: string | undefined
  if (descriptor) {
    try {
      name = await readProfileOptions(descriptor)
    } catch (cause) {
      profile.warnings.push(`อ่านชุดตัวเลือกจาก ${basename(descriptor.path)} ไม่สำเร็จ · ${cause instanceof Error ? cause.message : 'เกิดข้อผิดพลาด'}`)
      return
    }
  }
  const candidates = name ? profile.optionSets.filter((set) => optionNameKey(set.name) === optionNameKey(name)) : profile.optionSets
  if (candidates.length === 1) profile.defaultOptionsId = candidates[0].id
  else if (name) profile.warnings.push(candidates.length
    ? `พบชุดตัวเลือก ${name} หลายชุด` : `ไม่พบชุดตัวเลือก ${name} ที่ระบุในไฟล์ .ewp`)
}

async function discover(locators: Locator[], transferred: TransferProfile[] = []): Promise<EasyWorshipProfileFiles> {
  const indexed = new Map<string, Locator[]>()
  const groups = new Map<string, EasyWorshipProfileInventory>()
  const catalogOwners = new Map<string, string>()

  for (const locator of locators) {
    const path = locator.path
    const key = path.toLowerCase()
    const entries = indexed.get(key)
    if (entries) entries.push(locator)
    else indexed.set(key, [locator])

    const field = catalogKey(path)
    if (!field) continue
    const dataPath = path.slice(0, path.lastIndexOf('/') + 1)
    const id = dataPath.toLowerCase() || '/'
    const rootPath = easyWorshipProfileRoot(dataPath)
    if (!groups.has(id)) {
      const archiveName = easyWorshipArchiveName(dataPath)
      groups.set(id, {
        id,
        name: rootPath.replace(/\/$/, '') || 'EasyWorship profile',
        rootPath, dataPath, archiveName, files: {}, schedules: [], bibles: [], optionSets: [], warnings: [],
      })
    }
    catalogOwners.set(key, id)
  }

  const rootCounts = new Map<string, number>()
  for (const { rootPath, archiveName } of groups.values()) {
    const key = rootPath.toLowerCase()
    rootCounts.set(key, (rootCounts.get(key) ?? 0) + Number(!archiveName))
  }
  const roots = [...rootCounts.keys()].sort((a, b) => b.length - a.length)
  const keysByRoot = new Map<string, string[]>()
  for (const key of indexed.keys()) {
    const root = roots.find((candidate) => key.startsWith(candidate))
    if (root === undefined) continue
    const keys = keysByRoot.get(root)
    if (keys) keys.push(key)
    else keysByRoot.set(root, [key])
  }

  const scoped = new Map<string, EasyWorshipProfileAssetSource>()
  for (const profile of groups.values()) {
    const root = profile.rootPath.toLowerCase()
    const exported = /^(profiles\/([^/]+)\/)[^/]+\/$/.exec(root)
    const name = exported?.[2]
    const matches = transferred.filter((item) => item.name.toLowerCase() === name)
    if (profile.archiveName) {
      profile.name = `${matches[0]?.name ?? profile.name} · ฐานข้อมูลย้อนหลัง ${profile.archiveName}`
      profile.warnings.push('ฐานข้อมูลย้อนหลังใช้ไฟล์ภาพ วิดีโอ เสียง และงานนำเสนอจาก Resources ของโปรไฟล์ต้นทาง')
    } else if ((rootCounts.get(root) ?? 0) > 1) profile.name = profile.dataPath.replace(/\/$/, '') || '/'
    else if (matches.length === 1) {
      profile.name = matches[0].name
      profile.transfer = matches[0]
    }
    const paths = new Map<string, string[]>()
    const optionSets = new Map<string, EasyWorshipOptionSet>()
    function locate(path: string) {
      const safe = safePath(path)
      const key = safe?.toLowerCase()
      if (!key || !paths.has(key)) throw new Error('ไฟล์อยู่นอกโปรไฟล์ EasyWorship ที่เลือก')
      const entries = indexed.get(key) ?? []
      if (entries.length !== 1) throw new Error(`พบชื่อไฟล์ ${basename(path)} ซ้ำในโปรไฟล์เดียวกัน`)
      return { key, entry: entries[0] }
    }
    const read: EasyWorshipProfileAssetSource['read'] = async (path, onWalRecovery) => {
      const { key, entry } = locate(path)
      const limit = databaseLimit(key)
      const walKey = `${key}-wal`
      if (!limit || !/\.(?:db|dat)$/.test(key) || !paths.has(walKey)) return entry.read()
      const companions = indexed.get(walKey) ?? []
      if (companions.length !== 1) throw new Error(`พบไฟล์ ${basename(path)}-wal ซ้ำในโปรไฟล์เดียวกัน`)
      const [companion] = companions
      if (!companion.size) return entry.read()
      if (entry.size > limit || companion.size > limit) {
        throw new Error(`ฐานข้อมูล ${basename(path)} หรือไฟล์ WAL มีขนาดเกิน ${limit / 1024 / 1024} MB`)
      }
      const { sqliteWalSnapshot } = await import('./sqliteWal')
      const [database, wal] = await Promise.all([entry.read(), companion.read()])
      const snapshot = await sqliteWalSnapshot(database, wal, limit)
      if (snapshot.ignoredDamagedTail && !onWalRecovery) {
        throw new Error(`ท้ายไฟล์ ${basename(path)}-wal ไม่สมบูรณ์ ใช้หน้าตรวจโปรไฟล์เพื่อดูข้อมูลที่กู้ได้`)
      }
      onWalRecovery?.({ path, recovered: snapshot.recovered, ignoredDamagedTail: snapshot.ignoredDamagedTail })
      return snapshot.database
    }
    const withMedia: WithMediaBlob = async (path, consume) => {
      const { entry } = locate(path)
      return entry.withBlob ? entry.withBlob(consume) : consume(await read(path))
    }
    for (const key of keysByRoot.get(root) ?? []) {
      const relative = key.slice(root.length)
      const ownDataDirectory = key.startsWith(profile.id)
      if (archivedCatalogPrefix.test(relative) && !ownDataDirectory) continue
      if (profile.archiveName && !ownDataDirectory && !sharedArchiveMedia.test(relative)) continue
      const owner = catalogOwners.get(key.replace(/-(?:wal|shm)$/, ''))
      if (owner && owner !== profile.id) continue
      const entries = indexed.get(key) ?? []
      const path = entries[0].path
      paths.set(key, entries.map((entry) => entry.path))

      const field = catalogKey(path)
      const kind = profileFileKind(relative)
      const optionPath = /^((v6\.1\/)?options\/([^/]+)\.ewo)\/data\/(alerts\.db|serviceintervals\.db|(?:live|alt|livenursery|altoutnursery|livemessage|altoutmessage|foldback|foldbackmessage)\.settings\.db)$/i.exec(path.slice(root.length))
      if (entries.length !== 1) {
        if (field || kind || optionPath) profile.warnings.push(`พบไฟล์ ${basename(path)} ซ้ำในโปรไฟล์เดียวกัน`)
        continue
      }
      if (optionPath) {
        const id = optionPath[1].toLowerCase()
        const set = optionSets.get(id) ?? { id, name: optionPath[3], versioned: Boolean(optionPath[2]), defaultThemeFiles: [] }
        if (optionPath[4].toLowerCase() === 'alerts.db') set.alertFile = path
        else if (optionPath[4].toLowerCase() === 'serviceintervals.db') set.serviceIntervalsFile = path
        else if (/nursery\.settings\.db$/i.test(optionPath[4])) (set.nurseryStyleFiles ??= []).push(path)
        else if (/message\.settings\.db$/i.test(optionPath[4])) (set.messageStyleFiles ??= []).push(path)
        else if (optionPath[4].toLowerCase() === 'foldback.settings.db') set.foldbackAppearanceFile = path
        else set.defaultThemeFiles.push(path)
        optionSets.set(id, set)
      }
      if (field === 'songWords') {
        if (!profile.files.songWords || key.endsWith('.db')) profile.files.songWords = path
      } else if (field) {
        profile.files[field] = path
      }
      if (!kind) continue
      const item = lazyProfileFile(path, kind, read)
      if (kind === 'schedule') {
        const { withBlob } = entries[0]
        if (withBlob) item.withFile = (consume) => withBlob((blob) => consume(new File([blob], item.filename)))
        profile.schedules.push(item)
      } else profile.bibles.push(item)
    }
    const allOptions = [...optionSets.values()]
    const modern = profile.dataPath.toLowerCase().slice(root.length).startsWith('v6.1/')
    const currentOptions = allOptions.filter((set) => set.versioned === modern)
    profile.optionSets = currentOptions.length || (rootCounts.get(root) ?? 0) > 1 ? currentOptions : allOptions
    const descriptorPath = exported ? `${exported[1]}${name}.ewp` : `${root}${basename(root.slice(0, -1))}.ewp`
    if (!profile.archiveName) await selectDefaultOptions(profile, indexed.get(descriptorPath) ?? [])
    const size = (path: string) => {
      const key = path.toLowerCase()
      return paths.get(key)?.length === 1 ? indexed.get(key)?.[0]?.size : undefined
    }
    scoped.set(profile.id, { paths, read, withMedia, size })
  }

  function forProfile(id: string) {
    const source = scoped.get(id)
    if (!source) throw new Error('ไม่พบโปรไฟล์ EasyWorship')
    return source
  }

  return {
    profiles: [...groups.values()],
    forProfile,
    file: async (id, path) => new File([await forProfile(id).read(path)], basename(path)),
  }
}

/** Adds the original Resources folder to one selected backup profile. */
export function attachEasyWorshipProfileResources(
  files: EasyWorshipProfileFiles,
  profileId: string,
  folder: File[],
): EasyWorshipProfileFiles {
  const current = files.profiles.find((profile) => profile.id === profileId)
  if (!current) throw new Error('เลือกโปรไฟล์ก่อนแนบโฟลเดอร์ Resources')
  const original = files.forProfile(profileId)
  const additional = new Map<string, { path: string; file: File }[]>()
  const hashOnly = new Set<string>()
  const reserved = new Set(original.hashOnlyMedia?.map((path) => path.toLowerCase()))
  let foundResource = false
  for (const file of folder) {
    const path = safePath(file.webkitRelativePath)
    if (!path || !/^resources\/(?:images|videos|audio|presentations|schedules|bibles)\//i.test(path) || catalogKey(path)) continue
    foundResource = true
    if (current.archiveName && !sharedArchiveMedia.test(path.toLowerCase())) continue
    let destination = current.rootPath + 'Resources/' + path.slice('Resources/'.length)
    let key = destination.toLowerCase()
    if (original.paths.has(key)) {
      if (!sharedArchiveMedia.test(path.toLowerCase())) continue
      destination = `@attached-resources/${hashOnly.size}/${destination}`
      key = destination.toLowerCase()
      while (original.paths.has(key) || additional.has(key) || reserved.has(key)) {
        destination = '@' + destination
        key = destination.toLowerCase()
      }
      hashOnly.add(destination)
    }
    const entries = additional.get(key)
    if (entries) entries.push({ path: destination, file })
    else additional.set(key, [{ path: destination, file }])
  }
  if (!foundResource) throw new Error('เลือกโฟลเดอร์ Resources ที่มีสื่อหรือตารางจากโปรไฟล์ EasyWorship ต้นทาง')

  const read: EasyWorshipProfileAssetSource['read'] = async (path, onWalRecovery) => {
    const entries = additional.get(path.toLowerCase())
    if (!entries) return original.read(path, onWalRecovery)
    if (entries.length !== 1) throw new Error(`พบชื่อไฟล์ ${basename(path)} ซ้ำใน Resources ที่แนบ`)
    return entries[0].file
  }
  const paths = new Map(original.paths)
  const size = (path: string) => {
    const entries = additional.get(path.toLowerCase())
    return entries ? (entries.length === 1 ? entries[0].file.size : undefined) : original.size(path)
  }
  const withMedia: WithMediaBlob = async (path, consume) => additional.has(path.toLowerCase())
    ? consume(await read(path)) : withProfileMedia(original, path, consume)
  const profile = { ...current, schedules: [...current.schedules], bibles: [...current.bibles], warnings: [...current.warnings] }
  for (const [key, entries] of additional) {
    const [{ path }] = entries
    if (hashOnly.has(path)) continue
    paths.set(key, entries.map(({ path }) => path))
    if (entries.length !== 1) {
      profile.warnings.push(`พบชื่อไฟล์ ${basename(path)} ซ้ำใน Resources ที่แนบ`)
      continue
    }
    const kind = profileFileKind(key.slice(current.rootPath.length))
    if (kind === 'schedule') profile.schedules.push(lazyProfileFile(path, kind, read))
    if (kind === 'bible') profile.bibles.push(lazyProfileFile(path, kind, read))
  }
  return {
    profiles: files.profiles.map((entry) => entry.id === profileId ? profile : entry),
    forProfile: (id) => id === profileId ? {
      ...original, paths, read, withMedia, size, hashOnlyMedia: [...(original.hashOnlyMedia ?? []), ...hashOnly],
    } : files.forProfile(id),
    file: async (id, path) => id === profileId ? new File([await read(path)], basename(path)) : files.file(id, path),
  }
}

/** Adds separately installed Bible plug-ins to the selected profile review. */
export function attachEasyWorshipProfileBibles(files: EasyWorshipProfileFiles, profileId: string, attached: readonly File[]): EasyWorshipProfileFiles {
  const current = files.profiles.find((profile) => profile.id === profileId)
  if (!current) throw new Error('เลือกโปรไฟล์ก่อนแนบฉบับพระคัมภีร์')
  const bibles = attached.map((file, index): EasyWorshipLazyFile => ({
    path: `attached-bibles/${index}/${file.name}`, filename: file.name, kind: 'bible', readFile: async () => file,
  }))
  return { ...files, profiles: files.profiles.map((profile) => profile.id === profileId
    ? { ...profile, bibles: [...profile.bibles, ...bibles] } : profile) }
}

/** Includes separately saved .ews/.ewsx schedules in one profile's migration. */
export function attachEasyWorshipProfileSchedules(
  files: EasyWorshipProfileFiles, profileId: string, attached: readonly File[],
): EasyWorshipProfileFiles {
  const current = files.profiles.find((profile) => profile.id === profileId)
  if (!current) throw new Error('เลือกโปรไฟล์ก่อนแนบตารางนมัสการ')
  const schedules = [...current.schedules]
  const occupied = new Set(schedules.map(({ path }) => path.toLowerCase()))
  const warnings = [...current.warnings]
  attached.forEach((file, index) => {
    if (!/\.ewsx?$/i.test(file.name) || /[/\\\0]/.test(file.name)) {
      warnings.push(`${file.name} · เลือกไฟล์ตาราง EasyWorship .ews หรือ .ewsx`)
      return
    }
    let path = `@attached-schedules/${index}/${file.name}`
    while (occupied.has(path.toLowerCase())) path = '@' + path
    occupied.add(path.toLowerCase())
    schedules.push({ path, filename: file.name, kind: 'schedule', attached: true, readFile: async () => file })
  })
  return { ...files, profiles: files.profiles.map((profile) => profile === current ? { ...profile, schedules, warnings } : profile) }
}

export async function createEasyWorshipProfileFiles(source: File | File[]): Promise<EasyWorshipProfileFiles> {
  const locators: Locator[] = []
  if (Array.isArray(source)) {
    for (const file of source) {
      const path = safePath(file.webkitRelativePath || file.name)
      if (path) locators.push({ path, size: file.size, read: async () => file })
    }
    return discover(locators)
  }

  const { BlobReader, ZipReader } = await import('@zip.js/zip.js')
  const archive = new ZipReader(new BlobReader(source))
  try {
    const manifests: FileEntry[] = []
    const read = async (entry: FileEntry, path: string) => {
      if (entry.encrypted) throw new Error(`ไฟล์ ${basename(path)} ในโปรไฟล์ต้องใช้รหัสผ่าน`)
      const limit = databaseLimit(path)
      if (limit && entry.uncompressedSize > limit) {
        throw new Error(`ฐานข้อมูล ${basename(path)} มีขนาดเกิน ${limit / (1024 * 1024)} MB`)
      }
      return readZipAsset(source, entry)
    }
    for await (const entry of archive.getEntriesGenerator()) {
      if (entry.directory) continue
      const path = safePath(entry.filename)
      if (path) locators.push({
        path, size: entry.uncompressedSize, read: () => read(entry, path),
        ...(!entry.encrypted && !databaseLimit(path)
          ? { withBlob: <T>(consume: (blob: Blob) => Promise<T>) => withZipAsset(source, entry, consume) } : {}),
      })
      if (path?.toLowerCase() === 'manifest.json') manifests.push(entry)
    }
    const [manifest] = manifests
    const transferred = manifests.length === 1 && manifest.uncompressedSize <= MAX_MANIFEST_BYTES
      ? await read(manifest, 'manifest.json').then(async (blob) => transferProfiles(JSON.parse(await blob.text()))).catch(() => [])
      : []
    return discover(locators, transferred)
  } finally {
    await archive.close()
  }
}
