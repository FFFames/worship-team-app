/** Declares the desktop NDI input bridge and its machine-local input references. */

type NdiInputError = 'helper' | 'runtime' | 'receiver' | 'settings' | 'feedback'
type NdiInputStatus = { kind: 'status'; state: 'waiting' | 'lost' } | { kind: 'status'; state: 'error'; error: NdiInputError }
type NdiInputFrame = { kind: 'frame'; width: number; height: number; aspect: number; pixels: Uint8Array }
export type NdiInputAudio = { kind: 'audio'; rate: number; samples: number; pcm: Uint8Array }

declare global {
  interface Window {
    worshipNdiInput?: {
      discover: () => Promise<{ sources: string[] } | { error: NdiInputError }>
      watch: (sourceName: string, onUpdate: (update: NdiInputStatus | NdiInputFrame | NdiInputAudio) => void, audio?: boolean) => () => void
    }
  }
}

const ndiPrefix = 'ndi:'

export function ndiDeviceId(name: string) {
  return ndiPrefix + name
}

export function ndiDeviceName(id: string) {
  return id.startsWith(ndiPrefix) ? id.slice(ndiPrefix.length) : undefined
}

export function ndiInputError(error: NdiInputError) {
  switch (error) {
    case 'helper': return 'ยังไม่ได้สร้างโปรแกรมรับ NDI ให้รัน npm --prefix desktop run build:ndi'
    case 'runtime': return 'เปิด NDI Runtime 6 ไม่ได้ ตรวจการติดตั้ง NDI Runtime ให้ตรงกับเครื่องนี้'
    case 'feedback': return 'เลือกแหล่ง NDI อื่นเพื่อป้องกันการส่งภาพวนกลับเข้าจอตัวเอง'
    case 'settings': return 'เปิดแหล่ง NDI นี้จากหน้าควบคุมการนำเสนอ'
    case 'receiver': return 'เปิดตัวรับ NDI ไม่สำเร็จ กรุณาเลือกแหล่งสัญญาณแล้วลองอีกครั้ง'
  }
}
