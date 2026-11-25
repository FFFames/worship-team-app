import { useState } from 'react'
import type { CameraInput } from '../types/liveFeed'
import type { SlideDesign } from '../types/slideDesign'
import { cameraInputKey, designCameraAssets, savedCameraInput, saveCameraInput } from '../utils/livePresentation'
import { CameraInputControl } from './CameraInputControl'

export function LayeredFeedAssignments({ design, playlistId = '', onAssigned }: {
  design?: SlideDesign; playlistId?: string; onAssigned?: () => void
}) {
  const [saved, setSaved] = useState<Record<string, CameraInput>>({})
  const feeds = new Map(designCameraAssets(design).map((asset) => [cameraInputKey(playlistId, asset), asset]))
  if (!feeds.size) return null

  return <details className="my-3! min-w-0 rounded-lg border border-[var(--border-subtle)] p-3!" open>
    <summary className="mb-3! cursor-pointer text-sm font-medium">สัญญาณสดในสไลด์</summary>
    {[...feeds].map(([key, asset]) => {
      const assigned = saved[key] ?? savedCameraInput(key) ?? savedCameraInput(cameraInputKey('', asset))
      return <CameraInputControl key={key} name={asset.filename} hints={asset.deviceHints}
        feedSound={asset.feedSound} audioDeviceHint={asset.audioDeviceHint} assigned={assigned} onApply={(input) => {
          saveCameraInput(key, input)
          setSaved((current) => ({ ...current, [key]: input }))
          onAssigned?.()
        }} />
    })}
  </details>
}
