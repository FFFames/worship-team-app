/** Evaluates imported presentation and theme rules against the slide library. */

import type { LibraryDesign } from '../types/slideDesign'
import { designCollectionKey, localDesignCollectionKey } from './collectionLibrary'
import type { EasyWorshipCollection } from './easyWorshipCollections'
import { compileResourceCollectionRules, prepareResourceCollectionFilter } from './resourceCollectionRules'

export function compileDesignCollectionRules(group: EasyWorshipCollection) {
  return compileResourceCollectionRules(group, ['title', 'author', 'copyright', 'description', 'tags', 'filename', 'folder'])
}

export function prepareDesignCollectionFilter(collection: EasyWorshipCollection, leaves: readonly EasyWorshipCollection[]) {
  const includes = prepareResourceCollectionFilter(leaves, compileDesignCollectionRules)
  return (design: LibraryDesign) => {
    const presentation = design.kind === 'presentation'
    if (presentation !== (collection.resource === 'presentations')) return false
    const { source } = design.content
    const details = source?.collectionDetails
    return includes([designCollectionKey(source), localDesignCollectionKey(design.id)], () => ({
      title: design.title, author: source?.author ?? null, copyright: source?.copyright ?? null,
      description: source?.description ?? null,
      tags: !source || details ? details?.tags ?? null : undefined,
      filename: !source || details ? details?.filename ?? null : undefined,
      folder: !source || details ? details?.folder ?? null : undefined,
    }))
  }
}
