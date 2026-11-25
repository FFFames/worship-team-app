/** Connects the confirmed profile import to the app's existing libraries. */

import { useCallback, useRef, useState } from 'react'
import type { EasyWorshipProfileReview } from '../utils/easyWorshipProfile'
import { runEasyWorshipProfileImport, type ProfileImportProgress, type ProfileImportSelection } from '../utils/easyWorshipProfileImport'
import { resolveEasyWorshipSongIds, useEasyWorshipImport } from './useEasyWorshipImport'
import { useEasyWorshipScheduleImport } from './useEasyWorshipScheduleImport'
import { useImportSlideDesigns } from './useSlideDesigns'

export function useEasyWorshipProfileImport() {
  const saveSongs = useEasyWorshipImport()
  const saveDesigns = useImportSlideDesigns()
  const saveSchedule = useEasyWorshipScheduleImport()
  const [running, setRunning] = useState(false)
  const lock = useRef(false)

  const run = useCallback(async (
    review: EasyWorshipProfileReview, selection: ProfileImportSelection, onProgress?: (stage: ProfileImportProgress) => void,
  ) => {
    if (lock.current) throw new Error('กำลังนำเข้าโปรไฟล์')
    lock.current = true
    setRunning(true)
    try {
      return await runEasyWorshipProfileImport(review, selection, {
        songs: saveSongs, resolveSongIds: resolveEasyWorshipSongIds, designs: saveDesigns, schedule: saveSchedule,
      }, onProgress)
    } finally {
      lock.current = false
      setRunning(false)
    }
  }, [saveSongs, saveDesigns, saveSchedule])
  return { running, run }
}
