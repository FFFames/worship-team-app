/** Evaluates EasyWorship media rules against source records and the current library. */
import type { DvdClip } from '../types/dvdClip'
import type { LiveFeed } from '../types/liveFeed'
import type { MediaLibraryItem, MediaMetadata } from '../types/media'
import { dvdCollectionKey, feedCollectionKey, localMediaCollectionKey, mediaCollectionKey } from './collectionLibrary'
import type { EasyWorshipCollection } from './easyWorshipCollections'
import { compileResourceCollectionRules, prepareResourceCollectionFilter } from './resourceCollectionRules'

export function mediaCollectionFields({ name, filename, metadata, sourceFolder }: {
  name: string; filename?: string; metadata?: MediaMetadata; sourceFolder?: string
}) {
  const text = (key: string) => {
    const value = metadata?.[key]
    return typeof value === 'string' ? value : null
  }
  return {
    title: name, author: text('author'), description: text('description'), tags: text('tags'),
    filename: text('catalogFilename') ?? filename ?? null, folder: sourceFolder ?? text('sourceFolder'),
  }
}

const allowedFields = Object.keys(mediaCollectionFields({ name: '' }))

export function compileMediaCollectionRules(group: EasyWorshipCollection) {
  return compileResourceCollectionRules(group, allowedFields)
}

export function prepareMediaCollectionFilter(leaves: readonly EasyWorshipCollection[]) {
  const includes = prepareResourceCollectionFilter(leaves, compileMediaCollectionRules)
  return {
    includesMedia: (item: MediaLibraryItem) => includes([mediaCollectionKey(item.metadata?.mediaUid), localMediaCollectionKey(item.id)],
      () => mediaCollectionFields(item)),
    includesFeed: (feed: LiveFeed) => includes(feedCollectionKey(feed.id), () => mediaCollectionFields(feed)),
    includesDvd: (dvd: DvdClip) => includes(dvdCollectionKey(dvd.id), () => mediaCollectionFields(dvd)),
  }
}
