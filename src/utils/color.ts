export type RGB = { r: number; g: number; b: number }

export function clamp(n: number): number {
  return Math.max(0, Math.min(1, n))
}

export function ease(t: number): number {
  const p = clamp(t)
  return p * p * (3 - 2 * p)
}

export function interpolateColor(a: RGB, b: RGB, t: number): RGB {
  const f = clamp(t)
  return {
    r: Math.round(a.r + (b.r - a.r) * f),
    g: Math.round(a.g + (b.g - a.g) * f),
    b: Math.round(a.b + (b.b - a.b) * f),
  }
}

export function toRGBColor(c: RGB): string {
  const r = Math.max(0, Math.min(255, Math.round(c.r)))
  const g = Math.max(0, Math.min(255, Math.round(c.g)))
  const b = Math.max(0, Math.min(255, Math.round(c.b)))
  return `rgb(${r},${g},${b})`
}

export function toHexColor(c: RGB): string {
  const r = Math.max(0, Math.min(255, Math.round(c.r))).toString(16).padStart(2, '0')
  const g = Math.max(0, Math.min(255, Math.round(c.g))).toString(16).padStart(2, '0')
  const b = Math.max(0, Math.min(255, Math.round(c.b))).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

