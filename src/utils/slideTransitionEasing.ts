const reverse = (curve: (time: number) => number) => (time: number) => 1 - curve(1 - time)

// The bounce contacts and rebound peaks also serve as easing sample points.
const rebounds = [[4 / 11, 8 / 11, .25], [8 / 11, 10 / 11, .0625], [10 / 11, 1, .015625]]
export const bounceBreaks = rebounds.flatMap(([start, end]) => [start, (start + end) / 2])

export function bounceOut(time: number) {
  const rebound = rebounds.find(([start, end]) => time >= start && time <= end)
  if (!rebound) return (time * 11 / 4) ** 2
  const [start, end, height] = rebound
  const phase = (time - start) / (end - start)
  return 1 - height * 4 * phase * (1 - phase)
}

const backIn = (time: number) => time ** 2 * (2.70158 * time - 1.70158)
const circularIn = (time: number) => 1 - Math.sqrt(1 - time ** 2)
const circularStart = [1 / 128, 1 / 256, 1 / 512, 1 / 1024, 1 / 2048]
const quinticIn = (time: number) => time ** 5
const cubicIn = (time: number) => time ** 3
const smooth = (time: number) => time ** 2 * (3 - 2 * time)

export const slideTransitionRamps: readonly {
  value: string; label: string; curve?: (time: number) => number; breakpoints?: number[]
}[] = [
  { value: '-99', label: 'ความเร็วคงที่' },
  { value: '-3', label: 'Bounce In', curve: reverse(bounceOut), breakpoints: bounceBreaks.map((t) => 1 - t) },
  { value: '-2', label: 'Back In', curve: backIn },
  { value: '-1', label: 'Circular In', curve: circularIn, breakpoints: circularStart.map((time) => 1 - time) },
  { value: '0', label: 'Quintic In', curve: quinticIn },
  { value: '1', label: 'Cubic In', curve: cubicIn },
  { value: '2', label: 'เร่งและผ่อน', curve: smooth },
  { value: '3', label: 'Cubic Out', curve: reverse(cubicIn) },
  { value: '4', label: 'Quintic Out', curve: reverse(quinticIn) },
  { value: '5', label: 'Circular Out', curve: reverse(circularIn), breakpoints: circularStart },
  { value: '6', label: 'Back Out', curve: reverse(backIn) },
  { value: '7', label: 'Bounce Out', curve: bounceOut, breakpoints: bounceBreaks },
]

const samples = Array.from({ length: 65 }, (_, index) => index / 64)
const timingByRamp = new Map(slideTransitionRamps.map(({ value, curve, breakpoints = [] }) => {
  if (!curve) return [value, 'linear']
  const times = [...new Set([...samples, ...breakpoints])].sort((a, b) => a - b)
  const stops = times.map((time) => `${Number(curve(time).toFixed(6))} ${Number((time * 100).toFixed(6))}%`)
  return [value, `linear(${stops.join(', ')})`]
}))

export function slideTransitionEasing(value: string | undefined) {
  return timingByRamp.get(value?.trim() ?? '')
}
