import { describe, expect, it } from 'vitest'
import { slideTransitionEasing, slideTransitionRamps } from './slideTransitionEasing'
import { slideTransitionFrames } from './slideTransitions'

describe('slideTransitionFrames', () => {
  it('fades the outgoing and incoming images separately through black', () => {
    expect(slideTransitionFrames({ uid: 'sdDXBlend', values: { Duration: '1540', 'Value-ThroughBlack': '1' } })).toEqual({
      duration: 1540, backdrop: '#000',
      incoming: [{ opacity: 0 }, { offset: .5, opacity: 0 }, { opacity: 1 }],
      outgoing: [{ opacity: 1 }, { offset: .5, opacity: 0 }, { opacity: 0 }],
    })
  })

  it('plays a directional cover across the native duration, including its fade option', () => {
    expect(slideTransitionFrames({ uid: 'sdDXCover', values: { Duration: '750', 'Value-Direction': '3', 'Value-FadeIn': '1' } })).toEqual({
      duration: 750,
      incoming: [{ transform: 'translate(0%, 100%)', opacity: 0 }, { transform: 'translate(0%, 0%)', opacity: 1 }],
      outgoing: undefined,
    })
  })

  it('keeps unknown effects instant and replaces geometric motion with a short fade when requested', () => {
    expect(slideTransitionFrames({ uid: 'external-effect', values: { Duration: '500' } })).toBeUndefined()
    expect(slideTransitionFrames({ uid: 'sdDXPush', values: { Duration: '0' } })).toBeUndefined()
    expect(slideTransitionFrames({ uid: 'sdDXWipe', values: { Duration: '1200', Ramp: '3' } }, true)).toEqual({
      duration: 150, incoming: [{ opacity: 0 }, { opacity: 1 }],
    })
  })

  it('uses a 5% soft edge for Wipe and retains hard edge geometry for zero and fallback browsers', () => {
    const values = { 'Value-Direction': '5' }
    const frames = slideTransitionFrames({ uid: 'sdDXWipe', values }, false, { width: 800, height: 400 })!
    expect(frames.mask).toMatchObject({ kind: 'wipe', band: 10 })
    expect(frames.mask?.angle).toBeCloseTo(-26.565)
    expect(frames.incoming).toEqual([{ '--presentation-mask-front': '-10%' }, { '--presentation-mask-front': '100%' }])
    const hard = slideTransitionFrames({ uid: 'sdDXWipe', values: { ...values, 'Value-BorderSoftness': '0' } })
    expect(hard?.mask).toBeUndefined()
    expect(hard?.incoming?.[0].clipPath).toBe('polygon(100% 100%, 100% 100%, 100% 100%)')
    expect(slideTransitionFrames({ uid: 'sdDXWipe', values }, false, undefined, false)).toEqual(hard)
  })

  it('uses a 10% soft edge for Iris and masks the outgoing slide when closing', () => {
    const open = slideTransitionFrames({ uid: 'sdDXIris', values: {} })!
    const close = slideTransitionFrames({ uid: 'sdDXIris', values: { 'Value-Direction': '1' } })!
    expect(open.mask?.kind).toBe('iris-open')
    expect(close.mask?.kind).toBe('iris-close')
    expect(open.mask?.band).toBeCloseTo(28.28427)
    expect(close.exitOnTop).toBe(true)
    expect(close.outgoing).toEqual([...(open.incoming ?? [])].reverse())
    expect(slideTransitionFrames({ uid: 'sdDXIris', values: { 'Value-BorderSoftness': '0' } })?.incoming?.[0].clipPath)
      .toBe('ellipse(0% 0% at center)')
  })

  it('maps signed native ramps, including zero, overshoot, and rebound contacts', () => {
    const transition = { uid: 'sdDXCover', values: { Ramp: '0' } }
    expect(slideTransitionFrames(transition)?.easing).toContain('0.000977 25%')
    expect(slideTransitionEasing('2')).toContain('0.15625 25%')
    expect(slideTransitionEasing('6')).toContain('1.064137 75%')
    expect(slideTransitionEasing('7')).toContain('0.75 54.545455%')
    expect(slideTransitionEasing('-99')).toBe('linear')
    expect(slideTransitionEasing('8')).toBeUndefined()
    for (const { curve } of slideTransitionRamps) {
      if (!curve) continue
      expect(curve(0)).toBeCloseTo(0)
      expect(curve(1)).toBeCloseTo(1)
    }
  })

  it('rotates adjacent cube faces in the saved direction with the selected retreat and background', () => {
    const frames = slideTransitionFrames({ uid: 'sdCube', values: { Duration: '825', 'Value-Direction': '2',
      'Value-pushDistance': '40', 'Value-backgroundBrightness': '100' } }, false, { width: 800, height: 400 })!
    expect(frames).toMatchObject({ duration: 825, backdrop: 'rgb(255 255 255)' })
    expect(frames.incoming?.[0]).toMatchObject({ transform: 'perspective(720px) translateZ(-200px) rotateX(90deg) translateZ(200px)' })
    expect(frames.outgoing?.[1]).toMatchObject({ transform: 'perspective(720px) translateZ(-280px) rotateX(-45deg) translateZ(200px)' })
  })

  it('drops the next slide and retains both saved fade choices', () => {
    const frames = slideTransitionFrames({ uid: 'sdDXDrop', values: { Duration: '1200', 'Value-FadeIn': 'true', 'Value-FadeOut': '-1' } })!
    expect(frames.incoming?.[0]).toMatchObject({ opacity: 0, transform: 'translateY(-100%)' })
    expect(frames.incoming?.find(({ offset }) => offset === 6 / 11)?.transform).toBe('translateY(-25%)')
    expect(frames.incoming?.[frames.incoming.length - 1]).toMatchObject({ opacity: 1, transform: 'translateY(0%)' })
    expect(frames.outgoing).toEqual([{ opacity: 1 }, { opacity: 0 }])
    expect(slideTransitionFrames({ uid: 'sdDXDrop', values: { Ramp: '-99' } })).toMatchObject({
      easing: 'linear', incoming: [{ transform: 'translateY(-100%)' }, { transform: 'translateY(0%)' }],
    })
  })

  it('grows a resolution-scaled Hex Tile mask with matching path commands throughout the reveal', () => {
    const { incoming } = slideTransitionFrames({ uid: 'sdHexTile', values: {} }, false, { width: 640, height: 360 })!
    expect(incoming).toHaveLength(11)
    expect(incoming?.[0].clipPath).toContain('M0 0 L0 0 L0 0')
    expect(incoming?.[10].clipPath).not.toEqual(incoming?.[0].clipPath)
    const pathTopology = (frame: Keyframe) => String(frame.clipPath).match(/[MLZ]/g)
    expect(pathTopology(incoming![10])).toEqual(pathTopology(incoming![0]))
  })

  it('keeps the outgoing page over the reveal and honors direction and transparency', () => {
    const frames = slideTransitionFrames({ uid: 'sdPageFlip', values: { Duration: '900', 'Value-Direction': '1',
      'Value-pageTransparency': '70', 'Value-FadeIn': '1' } })!
    expect(frames).toMatchObject({ exitOnTop: true, incoming: [{ opacity: 0 }, { opacity: 1 }] })
    expect(frames.outgoing?.[3]).toMatchObject({ transformOrigin: 'right center', transform: 'perspective(2048px) rotateY(90deg)' })
    expect(Number(frames.outgoing?.[2].opacity)).toBeLessThan(.5)
    expect(slideTransitionFrames({ uid: 'sdPageFlip', values: { Duration: '900' } }, true)).toEqual({
      duration: 150, incoming: [{ opacity: 0 }, { opacity: 1 }],
    })
  })
})
