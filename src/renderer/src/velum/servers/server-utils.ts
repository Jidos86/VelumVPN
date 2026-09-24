export type PingBand = 'none' | 'timeout' | 'fast' | 'good' | 'normal' | 'slow'

export interface ServerEntry {
  name: string
  label: string
  code: string
  // The flag emoji from the node name ("" when it has none); drawn with the twemoji font.
  flag: string
  delay: number // -1 = not tested, 0 = timeout
  isAuto: boolean
  // for auto groups: the node the group currently resolves to
  resolvedName?: string
  // for auto groups: the node the user pinned in it (the group keeps using it until unpinned)
  fixed?: string
  // Custom per-node label from the panel/subscription ("serverDescription"), shown instead of the
  // generic "Server" subtitle when the provider set one.
  description?: string
}

const FLAG_PAIR = /[\u{1F1E6}-\u{1F1FF}]{2}/gu

// Node names come from the subscription, e.g. "Финляндия | FL 🇫🇮".
// Pull a country code out of the flag emoji (Windows has no flag glyphs) and strip it from the label.
export function parseServerName(name: string): { label: string; code: string; flag: string } {
  const flag = name.match(/[\u{1F1E6}-\u{1F1FF}]{2}/u)
  let code = ''
  if (flag) {
    code = [...flag[0]].map((ch) => String.fromCharCode(ch.codePointAt(0)! - 0x1f1e6 + 65)).join('')
  }
  const label = name
    .replace(FLAG_PAIR, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s|·–—-]+$/, '')
    .trim()
  if (!code) {
    const tail = label.match(/\|\s*([A-Za-z]{2})\b/)
    if (tail) code = tail[1].toUpperCase()
  }
  return { label: label || name, code, flag: flag ? flag[0] : '' }
}

export function lastDelay(item: { history?: { delay: number }[] }): number {
  const h = item.history
  return h && h.length > 0 ? h[h.length - 1].delay : -1
}

export function pingBand(delay: number): PingBand {
  if (delay === -1) return 'none'
  if (delay === 0) return 'timeout'
  if (delay < 250) return 'fast'
  if (delay < 600) return 'good'
  if (delay < 1300) return 'normal'
  return 'slow'
}

// Same colors as the previous server list (proxy-item.tsx), so the ping reads the same way.
export const bandColor: Record<PingBand, string> = {
  none: 'text-primary',
  timeout: 'text-destructive',
  fast: 'text-success',
  good: 'text-emerald-500',
  normal: 'text-warning',
  slow: 'text-destructive'
}
