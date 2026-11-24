export const COLOR_THEMES = ['original', 'cabinet', 'red', 'orange', 'green', 'purple', 'pink'] as const

export type ColorTheme = (typeof COLOR_THEMES)[number]

const ALIASES: Record<string, ColorTheme> = {
  original: 'original',
  default: 'original',
  reset: 'original',
  resetcolors: 'original',
  classic: 'original',
  cabinet: 'cabinet',
  new: 'cabinet',
  velum: 'cabinet',
  blue: 'cabinet',
  red: 'red',
  crimson: 'red',
  orange: 'orange',
  amber: 'orange',
  sunset: 'orange',
  green: 'green',
  emerald: 'green',
  purple: 'purple',
  violet: 'purple',
  pink: 'pink',
  rose: 'pink',
  sakura: 'pink'
}

function headerText(value: unknown): string {
  if (Array.isArray(value)) return headerText(value[0])
  return typeof value === 'string' ? value.trim() : ''
}

export function parseColorTheme(raw: unknown): ColorTheme | undefined {
  const text = decodeHeaderText(raw)
  if (!text || text.startsWith('{') || text.startsWith('[')) return undefined
  return ALIASES[text.toLowerCase()]
}

/**
 * A custom palette is nine RGB colours, canvas through muted:
 * canvas, titlebar, card, card2, border, primary, accent, text, muted.
 * Dashes are the canonical form. Hashes and comma, space, or semicolon
 * separators are accepted and stored as uppercase dashes.
 */
export function parseColorPalette(raw: unknown): string | undefined {
  const text = decodeHeaderText(raw)
  if (!text || text.startsWith('{') || text.startsWith('[')) return undefined
  const parts = text
    .split(/[\s,;]+/)
    .flatMap((chunk) => chunk.split('-'))
    .map((part) => part.replace(/^#/, ''))
    .filter(Boolean)
  if (parts.length !== 9 || !parts.every((part) => /^[0-9a-fA-F]{6}$/.test(part))) return undefined
  return parts.map((part) => part.toUpperCase()).join('-')
}

export type SubscriptionAppearance = { theme?: ColorTheme; palette?: string }

function decodeHeaderText(raw: unknown): string {
  let text = headerText(raw)
  if (text.toLowerCase().startsWith('base64:')) {
    try {
      text = Buffer.from(text.slice(7), 'base64').toString('utf-8').trim()
    } catch {
      return ''
    }
  }
  return text
}

function readAppearance(raw: unknown): SubscriptionAppearance | undefined {
  const theme = parseColorTheme(raw)
  if (theme) return { theme }
  const palette = parseColorPalette(raw)
  if (palette) return { palette }
  return undefined
}

function headerBySuffix(headers: Record<string, unknown> | undefined, suffix: string): string {
  if (!headers) return ''
  const key = Object.keys(headers).find((name) => name.toLowerCase().endsWith(suffix))
  return key ? headerText(headers[key]) : ''
}

function fromUrl(url: string | undefined): SubscriptionAppearance | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    const bags = [parsed.searchParams]
    const hash = parsed.hash.replace(/^#\??/, '')
    if (hash) bags.push(new URLSearchParams(hash))
    let appearance: SubscriptionAppearance | undefined
    for (const params of bags) {
      const next = readAppearance(params.get('color-profile') || params.get('theme'))
      if (next) appearance = next
    }
    return appearance
  } catch {
    return undefined
  }
}

function fromBody(body: string | undefined): SubscriptionAppearance | undefined {
  if (!body) return undefined
  let appearance: SubscriptionAppearance | undefined
  let fromColorProfile = false
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('#')) continue
    const match = trimmed.slice(1).trim().match(/^(color-profile|theme)\s*:?\s*(\S.*)$/i)
    if (!match) continue
    const next = readAppearance(match[2].trim())
    if (!next) continue
    if (match[1].toLowerCase() === 'color-profile' || !fromColorProfile) {
      appearance = next
      if (match[1].toLowerCase() === 'color-profile') fromColorProfile = true
    }
  }
  return appearance
}

/**
 * A subscription picks a built-in theme or a 9-colour palette with `color-profile`
 * (or `theme`): a response header, a comment in the body, or a parameter on the link.
 * The header wins over the body, and the body wins over the link.
 */
export function readSubscriptionTheme(input: {
  url?: string
  body?: string
  headers?: Record<string, unknown>
}): SubscriptionAppearance | undefined {
  return (
    readAppearance(headerBySuffix(input.headers, 'color-profile')) ??
    readAppearance(headerBySuffix(input.headers, 'theme')) ??
    fromBody(input.body) ??
    fromUrl(input.url)
  )
}
