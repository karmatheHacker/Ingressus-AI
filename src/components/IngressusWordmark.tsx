import React, { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import {
  clamp,
  ease,
  interpolateColor,
  toRGBColor,
  type RGB,
} from '../utils/color.js'
import { LETTERS, type Letter } from '../utils/letters.js'

export type WordmarkPalette = {
  bodyLeft: RGB
  bodyRight: RGB
  primary: RGB
  peak: RGB
  shadow: RGB
}

export const DEFAULT_PALETTE: WordmarkPalette = {
  bodyLeft: { r: 126, g: 134, b: 148 },   // Soft muted silver-grey
  bodyRight: { r: 242, g: 244, b: 247 },  // Bright crisp white
  primary: { r: 215, g: 224, b: 238 },    // Subtle icy tint
  peak: { r: 255, g: 255, b: 255 },       // Crisp white shine
  shadow: { r: 35, g: 39, b: 51 },        // Deep shadow for hollow interiors
}

type Trace = {
  glyph: number
  i: number
  l: number
}

type LogoMap = {
  glyph: Map<string, number>
  trace: Map<string, Trace>
  center: Map<number, { x: number; y: number }>
}

type Burst = {
  x: number
  y: number
  glyph: number
  at: number
  force: number
}

const LETTER_GAP = ' '
const BUILD_STEP_MS = 22
const BUILD_POP_MS = 240
const FRAME_MS = 45
const IDLE_MS = 4600
const IDLE_RINGS = 3
const IDLE_WIDTH = 3.8
const IDLE_TAIL = 9.5
const IDLE_PHASE_OFFSET = 0.29
const RIPPLE_MS = 1020
const BLOOM_MS = 1600

const NEAR = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
] as const

function key(x: number, y: number): string {
  return `${x},${y}`
}

function lit(char: string): boolean {
  return char !== ' ' && char !== '_' && char !== '~' && char !== ','
}

function painted(char: string): boolean {
  return char !== ' '
}

function route(list: Array<{ x: number; y: number }>) {
  const left = new Map(list.map(item => [key(item.x, item.y), item]))
  const path: Array<{ x: number; y: number }> = []
  let cur = [...left.values()].sort((a, b) => a.y - b.y || a.x - b.x)[0]
  let dir = { x: 1, y: 0 }

  while (cur) {
    path.push(cur)
    left.delete(key(cur.x, cur.y))
    if (!left.size) return path

    const next = NEAR.map(([dx, dy]) => left.get(key(cur.x + dx, cur.y + dy)))
      .filter((item): item is { x: number; y: number } => !!item)
      .sort((a, b) => {
        const ax = a.x - cur!.x
        const ay = a.y - cur!.y
        const bx = b.x - cur!.x
        const by = b.y - cur!.y
        const adot = ax * dir.x + ay * dir.y
        const bdot = bx * dir.x + by * dir.y
        if (adot !== bdot) return bdot - adot
        return Math.abs(ax) + Math.abs(ay) - (Math.abs(bx) + Math.abs(by))
      })[0]

    if (!next) {
      cur = [...left.values()].sort((a, b) => {
        const da = (a.x - cur!.x) ** 2 + (a.y - cur!.y) ** 2
        const db = (b.x - cur!.x) ** 2 + (b.y - cur!.y) ** 2
        return da - db
      })[0]
      dir = { x: 1, y: 0 }
      continue
    }

    dir = { x: next.x - cur.x, y: next.y - cur.y }
    cur = next
  }

  return path
}

function mapGlyphs(lines: readonly string[]): LogoMap {
  const cells: Array<{ x: number; y: number }> = []

  for (let y = 0; y < lines.length; y++) {
    for (let x = 0; x < (lines[y]?.length ?? 0); x++) {
      if (lit(lines[y]?.[x] ?? ' ')) cells.push({ x, y })
    }
  }

  const all = new Map(cells.map(item => [key(item.x, item.y), item]))
  const seen = new Set<string>()
  const glyph = new Map<string, number>()
  const trace = new Map<string, Trace>()
  const center = new Map<number, { x: number; y: number }>()
  let id = 0

  for (const item of cells) {
    const start = key(item.x, item.y)
    if (seen.has(start)) continue

    const stack = [item]
    const part: Array<{ x: number; y: number }> = []
    seen.add(start)

    while (stack.length) {
      const cur = stack.pop()!
      part.push(cur)
      glyph.set(key(cur.x, cur.y), id)

      for (const [dx, dy] of NEAR) {
        const next = all.get(key(cur.x + dx, cur.y + dy))
        if (!next) continue

        const mark = key(next.x, next.y)
        if (seen.has(mark)) continue

        seen.add(mark)
        stack.push(next)
      }
    }

    const path = route(part)
    path.forEach((cell, i) =>
      trace.set(key(cell.x, cell.y), { glyph: id, i, l: path.length }),
    )
    center.set(id, {
      x: part.reduce((sum, cell) => sum + cell.x, 0) / part.length + 0.5,
      y: (part.reduce((sum, cell) => sum + cell.y, 0) / part.length) * 2 + 1,
    })
    id++
  }

  return { glyph, trace, center }
}

type WordmarkDefinition = {
  lines: readonly string[]
  rows: number
  cols: number
  span: number
  map: LogoMap
  buildIndex: ReadonlyMap<string, number>
  buildMs: number
}

function nearestBuildGlyph(
  map: LogoMap,
  x: number,
  y: number,
): number | undefined {
  let best: number | undefined
  let bestDistance = Infinity

  for (const [glyph, center] of map.center.entries()) {
    const distance = Math.hypot(x + 0.5 - center.x, y * 2 + 1 - center.y)
    if (distance < bestDistance) {
      best = glyph
      bestDistance = distance
    }
  }

  return best
}

function createWordmark(letters: readonly Letter[]): WordmarkDefinition {
  const full = Array.from({ length: 4 }, (_, y) =>
    letters.map(letter => letter[y]).join(LETTER_GAP),
  )
  const rows = full.length
  const cols = Math.max(...full.map(line => line.length))
  const lines = full.map(line => line.padEnd(cols, ' '))
  const map = mapGlyphs(lines)
  const buildCells = lines
    .flatMap((line, y) =>
      Array.from(line)
        .map((char, x) => ({ char, x, y }))
        .filter(cell => painted(cell.char)),
    )
    .sort((a, b) => {
      const aGlyph =
        map.glyph.get(key(a.x, a.y)) ?? nearestBuildGlyph(map, a.x, a.y)
      const bGlyph =
        map.glyph.get(key(b.x, b.y)) ?? nearestBuildGlyph(map, b.x, b.y)
      const aCenter =
        aGlyph === undefined ? a.x : map.center.get(aGlyph)?.x ?? a.x
      const bCenter =
        bGlyph === undefined ? b.x : map.center.get(bGlyph)?.x ?? b.x
      return aCenter - bCenter || a.x - b.x || a.y - b.y
    })

  return {
    lines,
    rows,
    cols,
    span: Math.hypot(cols, rows * 2) * 0.94,
    map,
    buildIndex: new Map(
      buildCells.map((cell, index) => [key(cell.x, cell.y), index]),
    ),
    buildMs: buildCells.length * BUILD_STEP_MS + BUILD_POP_MS,
  }
}

// INGRESSUS AI Wordmark
export const INGRESSUS_WORDMARK = createWordmark([
  LETTERS.i,
  LETTERS.n,
  LETTERS.g,
  LETTERS.r,
  LETTERS.e,
  LETTERS.s,
  LETTERS.s,
  LETTERS.u,
  LETTERS.s,
  LETTERS.space,
  LETTERS.a,
  LETTERS.i,
])

function noise(x: number, y: number, t: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + t * 0.043) * 43758.5453
  return n - Math.floor(n)
}

function gaussian(value: number, width: number): number {
  return Math.exp(-((value / width) ** 2))
}

function baseInk(
  palette: WordmarkPalette,
  wordmark: WordmarkDefinition,
  x: number,
): RGB {
  return interpolateColor(
    palette.bodyLeft,
    palette.bodyRight,
    wordmark.cols > 1 ? x / (wordmark.cols - 1) : 1,
  )
}

function idle(
  wordmark: WordmarkDefinition,
  x: number,
  pixelY: number,
  time: number,
): { peak: number; primary: number } {
  const centerX = wordmark.cols / 2
  const centerY = wordmark.rows
  const reach = wordmark.span + IDLE_TAIL
  const dist = Math.hypot(x + 0.5 - centerX, pixelY + 0.5 - centerY)
  let peak = 0
  let primary = 0

  for (let ring = 0; ring < IDLE_RINGS; ring++) {
    const phase =
      ((time / IDLE_MS + ring / IDLE_RINGS - IDLE_PHASE_OFFSET) % 1 + 1) % 1
    const envelope = ease(Math.sin(phase * Math.PI))
    const head = phase * reach
    const delta = dist - head
    const crest =
      Math.abs(delta) < IDLE_WIDTH
        ? 0.5 + 0.5 * Math.cos((delta / IDLE_WIDTH) * Math.PI)
        : 0
    const tail =
      delta < 0 && delta > -IDLE_TAIL
        ? (1 + delta / IDLE_TAIL) ** 2.3
        : 0

    peak += crest * envelope * 0.26
    primary += (crest * 0.24 + tail * 0.13) * envelope
  }

  const breath = (0.5 + 0.5 * Math.sin(time * 0.0008)) * 0.035

  return {
    peak: 0.035 + peak / IDLE_RINGS,
    primary: breath + primary / IDLE_RINGS,
  }
}

function burstEffect(
  wordmark: WordmarkDefinition,
  x: number,
  y: number,
  bursts: readonly Burst[],
  time: number,
): { peak: number; primary: number } {
  let peak = 0
  let primary = 0

  for (const burst of bursts) {
    const age = time - burst.at
    if (age < 0 || age > BLOOM_MS) continue

    const p = age / RIPPLE_MS
    const dx = x + 0.5 - burst.x
    const dy = y * 2 + 1 - burst.y
    const dist = Math.hypot(dx, dy)

    if (age <= RIPPLE_MS) {
      const radius = wordmark.span * (1 - (1 - clamp(p)) ** 1.62)
      const fade = (1 - clamp(p)) ** 1.32
      const edge = gaussian(dist - radius, 0.76) * fade * burst.force
      const trail = dist < radius ? Math.exp(-(radius - dist) / 2.3) * fade : 0
      const flash =
        gaussian(dist, 2.2) * Math.max(0, 1 - age / 140) * burst.force
      const shimmer =
        edge *
        (0.72 + noise(x + burst.x * 0.5, y + burst.y * 0.4, age * 0.06) * 0.5)

      peak += shimmer * 0.8 + flash * 0.95
      primary += edge * 0.5 + trail * 0.2
    }

    const step = wordmark.map.trace.get(key(x, y))
    if (step && step.glyph === burst.glyph && step.l > 1) {
      const life = clamp(age / BLOOM_MS)
      const head = (age * 0.033) % step.l
      const distance = Math.min(
        Math.abs(step.i - head),
        step.l - Math.abs(step.i - head),
      )
      const trace = gaussian(distance, 1.05) * (1 - life) ** 0.58
      peak += trace * 0.9 * burst.force
      primary += trace * 0.42 * burst.force
    }

    const center = wordmark.map.center.get(burst.glyph)
    if (center && wordmark.map.glyph.get(key(x, y)) === burst.glyph) {
      const life = clamp(age / BLOOM_MS)
      const centerDistance = Math.hypot(x + 0.5 - center.x, y * 2 + 1 - center.y)
      const bloom = gaussian(centerDistance, 3.2) * (1 - life) ** 2
      peak += bloom * 0.42 * burst.force
      primary += bloom * 0.55 * burst.force
    }
  }

  return { peak, primary }
}

function tone(
  palette: WordmarkPalette,
  base: RGB,
  peak: number,
  primary: number,
): string {
  const tinted = interpolateColor(base, palette.primary, Math.min(0.54, primary))
  return toRGBColor(interpolateColor(tinted, palette.peak, Math.min(0.72, peak)))
}

function colorFor(
  wordmark: WordmarkDefinition,
  palette: WordmarkPalette,
  base: RGB,
  x: number,
  pixelY: number,
  bursts: readonly Burst[],
  time: number,
  animatable: boolean,
  extraPeak = 0,
  extraPrimary = 0,
): string {
  if (!animatable) return toRGBColor(base)

  const pulse = idle(wordmark, x, pixelY, time)
  const burst = burstEffect(
    wordmark,
    x,
    Math.floor(pixelY / 2),
    bursts,
    time,
  )
  return tone(
    palette,
    base,
    pulse.peak + burst.peak + extraPeak,
    pulse.primary + burst.primary + extraPrimary,
  )
}

interface IngressusWordmarkProps {
  palette?: WordmarkPalette
  animatable?: boolean
  skipIntro?: boolean
}

export const IngressusWordmark = React.memo(function IngressusWordmark({
  palette = DEFAULT_PALETTE,
  animatable = true,
  skipIntro = false,
}: IngressusWordmarkProps): React.ReactElement {
  const [time, setTime] = useState(() => Date.now())
  const [buildStartedAt] = useState(() =>
    animatable && !skipIntro ? Date.now() : null
  )
  const [bursts, setBursts] = useState<readonly Burst[]>([])
  const [isAnimationFinished, setIsAnimationFinished] = useState(
    () => skipIntro || !animatable
  )

  const wordmark = INGRESSUS_WORDMARK

  // Animation frame loop: runs ONLY during initial intro build (~1.8s) then terminates cleanly!
  // This completely eliminates perpetual 45ms repaints and terminal screen flickering.
  useEffect(() => {
    if (!animatable || skipIntro || isAnimationFinished) return
    const start = buildStartedAt ?? Date.now()
    const totalDuration = wordmark.buildMs + 100

    const interval = setInterval(() => {
      const now = Date.now()
      if (now - start >= totalDuration) {
        setIsAnimationFinished(true)
        clearInterval(interval)
      } else {
        setTime(now)
      }
    }, FRAME_MS)
    return () => clearInterval(interval)
  }, [animatable, skipIntro, isAnimationFinished, buildStartedAt, wordmark.buildMs])

  // Energy burst effects: only run during the intro build
  useEffect(() => {
    if (!animatable || skipIntro || isAnimationFinished) return
    const burstTimer = setInterval(() => {
      const glyphCount = wordmark.map.center.size
      if (glyphCount === 0) return
      const randomGlyph = Math.floor(Math.random() * glyphCount)
      const center = wordmark.map.center.get(randomGlyph)
      if (center) {
        setBursts(list => [
          ...list.slice(-2),
          {
            x: center.x,
            y: center.y,
            glyph: randomGlyph,
            at: Date.now(),
            force: 0.8 + Math.random() * 0.4,
          },
        ])
      }
    }, 800)
    return () => clearInterval(burstTimer)
  }, [animatable, skipIntro, isAnimationFinished, wordmark])

  // Prune expired bursts
  useEffect(() => {
    if (isAnimationFinished || bursts.length === 0) return
    setBursts(list => {
      const next = list.filter(b => time - b.at <= BLOOM_MS)
      return next.length === list.length ? list : next
    })
  }, [bursts.length, time, isAnimationFinished])

  const renderCell = (char: string, x: number, y: number) => {
    const index = wordmark.buildIndex.get(key(x, y))
    const buildAge =
      buildStartedAt == null || index === undefined
        ? Infinity
        : time - buildStartedAt - index * BUILD_STEP_MS
    const revealed = index === undefined || buildAge >= 0
    if (!revealed) return <Text key={x}> </Text>

    const pop =
      animatable && buildStartedAt !== null && index !== undefined
        ? 1 - ease(clamp(buildAge / BUILD_POP_MS))
        : 0
    const extraPeak = pop * 0.78
    const extraPrimary = pop * 0.34

    const inkTop = colorFor(
      wordmark,
      palette,
      baseInk(palette, wordmark, x),
      x,
      y * 2,
      bursts,
      time,
      animatable,
      extraPeak,
      extraPrimary,
    )
    const inkBottom = colorFor(
      wordmark,
      palette,
      baseInk(palette, wordmark, x),
      x,
      y * 2 + 1,
      bursts,
      time,
      animatable,
      extraPeak,
      extraPrimary,
    )
    const shadowTop = colorFor(
      wordmark,
      palette,
      palette.shadow,
      x,
      y * 2,
      bursts,
      time,
      animatable,
      extraPeak * 0.22,
      extraPrimary * 0.2,
    )
    const shadowBottom = colorFor(
      wordmark,
      palette,
      palette.shadow,
      x,
      y * 2 + 1,
      bursts,
      time,
      animatable,
      extraPeak * 0.22,
      extraPrimary * 0.2,
    )

    if (char === ' ') {
      return <Text key={x}> </Text>
    }

    if (char === '_') {
      return (
        <Text key={x} color={shadowBottom} backgroundColor={shadowBottom}>
          {' '}
        </Text>
      )
    }

    if (char === '^') {
      return (
        <Text key={x} color={inkTop} backgroundColor={shadowBottom}>
          ▀
        </Text>
      )
    }

    if (char === '~') {
      return (
        <Text key={x} color={shadowTop}>
          ▀
        </Text>
      )
    }

    if (char === ',') {
      return (
        <Text key={x} color={shadowBottom}>
          ▄
        </Text>
      )
    }

    if (char === '█') {
      return (
        <Text
          key={x}
          color={colorFor(
            wordmark,
            palette,
            baseInk(palette, wordmark, x),
            x,
            y * 2 + 1,
            bursts,
            time,
            animatable,
            extraPeak,
            extraPrimary,
          )}
          bold
        >
          █
        </Text>
      )
    }

    if (char === '▀') {
      return (
        <Text key={x} color={inkTop}>
          ▀
        </Text>
      )
    }

    if (char === '▄') {
      return (
        <Text key={x} color={inkBottom}>
          ▄
        </Text>
      )
    }

    return (
      <Text
        key={x}
        color={tone(palette, baseInk(palette, wordmark, x), 0, 0)}
      >
        {char}
      </Text>
    )
  }

  return (
    <Box flexDirection="column" alignItems="center">
      {wordmark.lines.map((line, y) => (
        <Box key={y}>
          {Array.from(line).map((char, x) => renderCell(char, x, y))}
        </Box>
      ))}
    </Box>
  )
})

