import type { CSSProperties } from 'react'

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full.length === 6 ? full : '000000', 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function shadeColor(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex)
  const to = (v: number): string =>
    Math.max(0, Math.min(255, Math.round(v * factor)))
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

/**
 * CSS custom properties that drive the single-accent theme. The one color
 * chosen in Settings (prefs.color) is injected as `--sl-accent` so every
 * element using `.sl-accent-bg` / `.sl-accent-text` follows it.
 */
export function themeCssVars(color: string): CSSProperties {
  return {
    '--sl-accent': color,
    '--sl-accent-dark': shadeColor(color, 0.78),
  } as CSSProperties
}