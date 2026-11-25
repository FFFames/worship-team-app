import type { DesignTextRun } from './slideDesign'

export const alertOutputLabels = {
  live: 'จอผู้ชม',
  stage: 'จอเวที',
  alternate: 'จอถ่ายทอดสด',
}

export type AlertOutput = keyof typeof alertOutputLabels
export type AlertPlayback = {
  mode: 'static' | 'scroll' | 'when-needed'
  alignment: 'left' | 'center' | 'right'
  passes: number | null
  endOnToken?: boolean
}

export type AlertToken = {
  id: string
  name: string
  uid: string | null
  type: number | null
  format: string | null
  interval: number | null
  timeValue: string | null
  fixedTime: string | null
  allowOverrun: number | null
  value?: string | null
}

export type AlertServiceInterval = {
  startDay: number
  startSeconds: number
  endDay: number
  endSeconds: number
}

export type AlertResourceCatalog = {
  id: string
  sourceName: string
  tokens: { output: AlertOutput; token: AlertToken }[]
  serviceIntervals: AlertServiceInterval[]
}

export type AlertTokenSettings = {
  tokens: AlertToken[]
  endToken: string | null
  serviceIntervals?: AlertServiceInterval[]
}

export type OutputAlert = {
  id: string
  revision?: number
  text: string
  runs?: DesignTextRun[]
  playback: AlertPlayback
  clock?: {
    startedAt: number
    tokens: AlertToken[]
    endToken: string | null
    serviceIntervals?: AlertServiceInterval[]
  }
}

export type AlertProgress = { id: string; remaining: number; revision?: number }

export type AlertTemplate = {
  id: string
  title: string
  text: string
  output: AlertOutput
  playback?: AlertPlayback
  runs?: DesignTextRun[]
  tokenSettings?: AlertTokenSettings
  source?: {
    profileName: string
    rowId: string
    rtf: string
    displayType: number | null
    alignment: number | null
    endType: number | null
    repeatCount: number | null
    endToken: string | null
    tokens: AlertToken[]
    serviceIntervals?: AlertServiceInterval[]
  }
}
