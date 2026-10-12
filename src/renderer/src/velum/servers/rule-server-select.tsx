import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Search, Sparkles } from 'lucide-react'
import { parseServerName, ServerEntry } from './server-utils'

const FLAG_SIZE = 36

export const FlagMark: React.FC<{ flag?: string; code?: string; auto?: boolean; bare?: boolean }> = ({
  flag,
  code,
  auto,
  bare
}) => {
  // "bare" drops the tile's own background/ring - for spots (like the per-rule pin chip) that
  // already sit inside their own panel, where a second nested panel just reads as a stray patch.
  const tile = bare ? 'bg-white/8' : 'bg-white/6 ring-1 ring-white/10'
  if (auto) {
    return (
      <span className={`flex h-6 w-8 shrink-0 items-center justify-center rounded-sm text-vl-accent ${bare ? '' : 'bg-white/6'}`}>
        <Sparkles className="size-3.5" />
      </span>
    )
  }
  if (flag) {
    // Flex-centers the glyph instead of absolute-positioning + translate()'ing it: a transformed
    // color-emoji span inside an overflow-hidden ancestor can get promoted to its own compositing
    // layer in Chromium and ignore the ancestor's clip entirely, which is what made this bleed
    // past its box full-size instead of being cropped.
    return (
      <span
        className={`relative flex h-6 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm ${tile}`}
        style={{ clipPath: 'inset(0)' }}
      >
        <span aria-hidden className="flag-emoji select-none leading-none" style={{ fontSize: FLAG_SIZE }}>
          {flag}
        </span>
      </span>
    )
  }
  return (
    <span className={`flex h-6 w-8 shrink-0 items-center justify-center rounded-sm text-[10px] font-bold tracking-wide text-vl-muted ${bare ? '' : 'bg-white/6'}`}>
      {code || '··'}
    </span>
  )
}

export const RuleServerList: React.FC<{
  value: string
  entries: ServerEntry[]
  current?: ServerEntry
  onChange: (proxy: string) => void
}> = ({ value, entries, current, onChange }) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const selected = useMemo(() => {
    if (!value) return undefined
    return (
      entries.find((s) => s.name === value) ?? {
        ...parseServerName(value),
        name: value,
        delay: -1,
        isAuto: false
      }
    )
  }, [entries, value])
  const filtered = useMemo(() => {
    const extra = value && !entries.some((s) => s.name === value) && selected ? [selected] : []
    const list = [...extra, ...entries]
    if (!q) return list
    return list.filter(
      (s) => s.label.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    )
  }, [entries, q, selected, value])

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-vl-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('velumUi.server.search')}
          className="w-full rounded-xl border border-vl-line bg-vl-tile py-2 pl-8 pr-3 text-sm text-vl-text outline-none placeholder:text-vl-faint focus:border-vl-accent/50"
        />
      </div>
      <div className="custom-scrollbar max-h-64 overflow-y-auto rounded-xl border border-vl-line p-1">
        <button
          type="button"
          onClick={() => onChange('')}
          className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
            !value ? 'bg-vl-accent/14' : 'hover:bg-white/6'
          }`}
        >
          <FlagMark auto />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-vl-text">{t('customRules.serverAuto')}</span>
            <span className="block truncate text-xs text-vl-muted">
              {current
                ? t('customRules.serverAutoNow', { server: current.label })
                : t('customRules.serverAutoHint')}
            </span>
          </span>
          {!value && <Check className="size-4 shrink-0 text-vl-accent" />}
        </button>
        {filtered.map((s) => {
          const active = value === s.name
          return (
            <button
              key={s.name}
              type="button"
              onClick={() => onChange(s.name)}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                active ? 'bg-vl-accent/14' : 'hover:bg-white/6'
              }`}
            >
              <FlagMark flag={s.flag} code={s.code} auto={s.isAuto} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-vl-text">{s.label}</span>
              {active && <Check className="size-4 shrink-0 text-vl-accent" />}
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-vl-faint">{t('velumUi.server.empty')}</p>
        )}
      </div>
    </div>
  )
}
