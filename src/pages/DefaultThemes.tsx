import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDefaultThemes } from '../hooks/useDefaultThemes'
import { useSlideDesigns } from '../hooks/useSlideDesigns'
import type { DesignKind } from '../types/slideDesign'
import type { MediaLibraryItem } from '../types/media'
import { libraryMediaVisual, listLibraryMedia } from '../utils/mediaLibrary'
import {
  logoMediaTheme, saveDefaultThemes, themeOutputs, themeSubjects, themeOutputLabels, themeSubjectLabels,
  type DefaultThemeSlot, type ThemeSubject, type ThemeOutput,
} from '../utils/defaultThemes'

const supportedKinds: Record<ThemeSubject, DesignKind[]> = {
  song: ['song-theme', 'text-theme'],
  scripture: ['scripture-theme', 'text-theme'],
  presentation: ['presentation-theme'],
}

export default function DefaultThemes() {
  const saved = useDefaultThemes()
  const library = useSlideDesigns()
  const [media, setMedia] = useState<MediaLibraryItem[]>([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void listLibraryMedia().then((items) => {
      if (active) setMedia(items.filter(({ kind }) => kind !== 'audio'))
    }).catch(() => { if (active) setError('อ่านคลังสื่อสำหรับตั้งโลโก้ไม่ได้') })
    return () => { active = false }
  }, [])

  function selectLogo(output: ThemeOutput, id: string) {
    const item = media.find((choice) => choice.id === id)
    const visual = item && libraryMediaVisual(item, true)
    const presentation = library.designs.find((choice) => choice.kind === 'presentation' && choice.id === id)
    if (id && !visual && !presentation) return
    const logo = item && visual ? logoMediaTheme(item.id, item.name, visual.asset, visual.loop)
      : presentation ? { id: presentation.id, title: presentation.title, slides: presentation.content.slides,
        looping: presentation.content.looping } : null
    setError('')
    setStatus('')
    try {
      saveDefaultThemes({ [`${output}:logo`]: logo })
      setStatus('บันทึกโลโก้พักจอแล้ว')
    } catch { setError('บันทึกโลโก้ในเบราว์เซอร์ไม่ได้') }
  }

  function selectTheme(slot: DefaultThemeSlot, id: string) {
    const theme = library.designs.find((design) => design.id === id)
    if (id && !theme) return
    setError('')
    setStatus('')
    try {
      saveDefaultThemes({ [slot]: theme ? { id, title: theme.title, slides: theme.content.slides } : null })
      setStatus('บันทึกธีมเริ่มต้นแล้ว สไลด์ที่ส่งขึ้นจอครั้งถัดไปจะใช้การตั้งค่านี้')
    } catch {
      setError('บันทึกธีมเริ่มต้นในเบราว์เซอร์ไม่ได้')
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header className="page-header mb-0!">
        <div className="page-title">
          <h1>ธีมเริ่มต้นของจอ</h1>
          <p>เลือกธีมเริ่มต้นและโลโก้พักจอสำหรับเบราว์เซอร์นี้</p>
        </div>
        <Link to="/settings/output" className="btn-secondary">ตั้งค่าจอ</Link>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {themeOutputs.map((output) => (
          <fieldset key={output} className="surface grid min-w-0 gap-4 rounded-xl p-4!">
            <legend className="px-2! font-medium">{themeOutputLabels[output]}</legend>
            {themeSubjects.map((subject) => {
              const slot: DefaultThemeSlot = `${output}:${subject}`
              const current = saved[slot]
              const choices = library.designs.filter((design) => supportedKinds[subject].includes(design.kind)
                && (subject === 'presentation' || design.content.slides.some((slide) =>
                  slide.design.layers.some((layer) => layer.kind === 'text' && layer.slot === 'content'))))
              return (
                <div key={slot} className="grid min-w-0 gap-1 text-sm">
                  <label htmlFor={slot}>{themeSubjectLabels[subject]}</label>
                  <select id={slot} className="input-field min-w-0" value={current?.id ?? ''} onChange={(event) => selectTheme(slot, event.currentTarget.value)}>
                    <option value="">ใช้ค่าปกติ</option>
                    {current && !choices.some(({ id }) => id === current.id) && <option value={current.id}>{current.title}</option>}
                    {choices.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
                  </select>
                </div>
              )
            })}
            <div className="grid min-w-0 gap-1 text-sm">
              <label htmlFor={`${output}:logo`}>โลโก้พักจอ</label>
              <select id={`${output}:logo`} className="input-field min-w-0" value={saved[`${output}:logo`]?.id ?? ''}
                onChange={(event) => selectLogo(output, event.currentTarget.value)}>
                <option value="">ใช้ค่าปกติ</option>
                {saved[`${output}:logo`] && ![...media, ...library.designs].some(({ id }) => id === saved[`${output}:logo`]?.id)
                  && <option value={saved[`${output}:logo`]?.id}>{saved[`${output}:logo`]?.title}</option>}
                {media.length > 0 && <optgroup label="คลังสื่อ">
                  {media.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                </optgroup>}
                {library.designs.some(({ kind }) => kind === 'presentation') && <optgroup label="งานนำเสนอ">
                  {library.designs.filter(({ kind }) => kind === 'presentation')
                    .map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
                </optgroup>}
              </select>
            </div>
          </fieldset>
        ))}
      </div>
      {status && <p role="status" className="text-sm!">{status}</p>}
      {(error || library.error) && <p role="alert" className="text-sm! text-[var(--status-error-text)]">{error || library.error}</p>}
    </main>
  )
}
