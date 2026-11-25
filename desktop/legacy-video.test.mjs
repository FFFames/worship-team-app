import assert from 'node:assert/strict'
import { test } from 'vitest'
import { registerLegacyVideo } from './legacy-video.cjs'

test('allows only the selected import route to stage bounded video chunks', async () => {
  const handlers = new Map()
  const bridge = registerLegacyVideo({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    allowed: (event) => event === 'control',
  })
  const invoke = async (action, event, ...args) => handlers.get(`legacy-video:${action}`)(event, ...args)
  bridge.close()
  await assert.rejects(invoke('open', 'presenter', 'wmv', 4))
  await assert.rejects(invoke('open', 'control', 'mp4', 4))
  const id = await invoke('open', 'control', 'wmv', 4)
  try {
    await assert.rejects(invoke('open', 'control', 'avi', 4))
    await assert.rejects(invoke('convert', 'control', id))
    await assert.rejects(invoke('write', 'control', id, 1, new Uint8Array(3)))
    await assert.rejects(invoke('write', 'presenter', id, 0, new Uint8Array(4)))
    await invoke('write', 'control', id, 0, new Uint8Array(2))
    await assert.rejects(invoke('write', 'control', id, 2, new Uint8Array(3)))
    await assert.rejects(invoke('read', 'control', id, 0))
  } finally {
    await invoke('release', 'control', id)
  }
  await assert.rejects(invoke('write', 'control', id, 2, new Uint8Array(2)))
  const another = await invoke('open', 'control', 'mpg', 4)
  await invoke('release', 'control', another)
})
