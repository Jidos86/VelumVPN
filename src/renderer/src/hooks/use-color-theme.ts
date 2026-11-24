import { useEffect } from 'react'
import { useAppConfig } from '@renderer/hooks/use-app-config'

export type ColorThemeId =
  | 'original'
  | 'cabinet'
  | 'red'
  | 'orange'
  | 'green'
  | 'purple'
  | 'pink'
  | 'custom'

const NAMED = new Set<ColorThemeId>(['original', 'cabinet', 'red', 'orange', 'green', 'purple', 'pink'])

const PALETTE_PROPS = [
  '--color-vl-bg',
  '--color-vl-chrome',
  '--color-vl-panel',
  '--color-vl-tile',
  '--color-vl-line',
  '--color-vl-line-strong',
  '--color-vl-text',
  '--color-vl-muted',
  '--color-vl-accent',
  '--color-vl-blue',
  '--color-vl-nav-bg',
  '--vl-glow'
]

/** canvas, titlebar, card, card2, border, primary, accent, text, muted */
export function paletteToCss(palette: string): Record<string, string> | undefined {
  const parts = palette.split('-')
  if (parts.length !== 9 || !parts.every((part) => /^[0-9A-F]{6}$/.test(part))) return undefined
  const [canvas, titlebar, card, card2, border, primary, accent, text, muted] = parts
  return {
    '--color-vl-bg': `#${canvas}`,
    '--color-vl-chrome': `#${titlebar}`,
    '--color-vl-panel': `#${card}`,
    '--color-vl-tile': `#${card2}`,
    '--color-vl-line': `#${border}`,
    '--color-vl-line-strong': `#${border}`,
    '--color-vl-blue': `#${primary}`,
    '--color-vl-accent': `#${accent}`,
    '--color-vl-text': `#${text}`,
    '--color-vl-muted': `#${muted}`,
    '--color-vl-nav-bg': `#${card2}`,
    '--vl-glow': `#${primary}35`
  }
}

export function useResolvedColorTheme(): ColorThemeId {
  const { appConfig } = useAppConfig()
  const mode = appConfig?.colorThemeMode
  if (mode === 'custom') return appConfig?.colorPalette ? 'custom' : 'original'
  return mode && NAMED.has(mode) ? mode : 'original'
}

export function useApplyColorTheme(): void {
  const theme = useResolvedColorTheme()
  const { appConfig } = useAppConfig()
  const palette = appConfig?.colorPalette
  useEffect(() => {
    const root = document.documentElement
    for (const prop of PALETTE_PROPS) root.style.removeProperty(prop)
    if (theme === 'custom' && palette) {
      const vars = paletteToCss(palette)
      if (vars) {
        root.dataset.colorTheme = 'custom'
        for (const [prop, value] of Object.entries(vars)) root.style.setProperty(prop, value)
        return
      }
    }
    if (theme === 'original' || theme === 'custom') delete root.dataset.colorTheme
    else root.dataset.colorTheme = theme
  }, [theme, palette])
}
