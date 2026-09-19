import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronRight, RefreshCw, Search, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useServers } from './use-servers'
import { bandColor, pingBand, PingBand, ServerEntry } from './server-utils'

function useBandLabel(): (band: PingBand) => string {
  const { t } = useTranslation()
  return (band) => {
    switch (band) {
      case 'fast':
        return t('proxies.fast')
      case 'good':
        return t('proxies.good')
      case 'normal':
        return t('proxies.normal')
      case 'slow':
        return t('proxies.slow')
      case 'timeout':
        return t('proxies.timeout')
      default:
        return t('proxies.delayTest')
    }
  }
}

const CodeBadge: React.FC<{ entry: ServerEntry }> = ({ entry }) => (
  <div className="flex h-8 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[11px] font-bold tracking-wide text-vl-muted">
    {entry.isAuto ? <Sparkles className="size-4 text-vl-accent" /> : entry.code || '··'}
  </div>
)

// Ping label follows the same rules as the previous list: a speed label by default,
// or the number in ms when the "delay display" appearance setting is switched to numbers.
const Ping: React.FC<{ delay: number }> = ({ delay }) => {
  const { appConfig } = useAppConfig()
  const bandLabel = useBandLabel()
  const band = pingBand(delay)
  const numberMode = (appConfig?.delayDisplayMode ?? 'text') === 'number'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${bandColor[band]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {numberMode && delay > 0 ? `${delay} ms` : bandLabel(band)}
    </span>
  )
}

// Names already auto-tested this session, so re-mounting the card does not re-run the test.
const autoTested = new Set<string>()

// Collapsed row on the home screen: current server + ping, opens the picker.
export const ServerCard: React.FC = () => {
  const { t } = useTranslation()
  const servers = useServers()
  const [open, setOpen] = useState(false)
  const current = servers.current
  // For an auto group show which node it resolved to and that node's ping.
  const resolved = useMemo(
    () =>
      current?.isAuto
        ? servers.entries.find((e) => e.name === current.resolvedName)
        : undefined,
    [current, servers.entries]
  )
  const shown = resolved ?? current

  // Fetch the ping of the node in use once, so the card is not stuck on "not tested".
  const shownName = shown?.name
  const shownUntested = shown !== undefined && shown.delay === -1
  useEffect(() => {
    if (!shownName || !shownUntested || autoTested.has(shownName)) return
    autoTested.add(shownName)
    servers.testOne(shownName)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownName, shownUntested])

  if (!servers.groupName) return null

  return (
    <>
      <button
        type="button"
        data-guide="home-group-selector"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-vl-line bg-vl-panel px-3.5 py-3 text-left transition-colors hover:border-vl-line-strong"
      >
        {current && <CodeBadge entry={shown ?? current} />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-vl-text">
            {current ? current.label : t('velumUi.server.choose')}
          </div>
          <div className="truncate text-xs text-vl-muted">
            {current?.isAuto && shown && shown !== current
              ? `${t('velumUi.server.now')}: ${shown.label}`
              : t('velumUi.server.title')}
          </div>
        </div>
        {shown && <Ping delay={shown.delay} />}
        <ChevronRight className="size-4 shrink-0 text-vl-faint" />
      </button>
      {open && <ServerPickerModal servers={servers} onClose={() => setOpen(false)} />}
    </>
  )
}

const ServerPickerModal: React.FC<{
  servers: ReturnType<typeof useServers>
  onClose: () => void
}> = ({ servers, onClose }) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return servers.entries
    return servers.entries.filter(
      (e) => e.label.toLowerCase().includes(q) || e.code.toLowerCase().includes(q)
    )
  }, [servers.entries, query])

  const choose = async (entry: ServerEntry): Promise<void> => {
    try {
      await servers.select(entry.name)
      onClose()
    } catch (e) {
      toast.error(`${e}`)
    }
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-8 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={t('velumUi.server.choose')}
        className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border border-vl-line-strong bg-vl-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="text-base font-bold text-vl-text">{t('velumUi.server.choose')}</div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={servers.testingAll}
              onClick={() => servers.testAll()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-vl-accent transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${servers.testingAll ? 'animate-spin' : ''}`} />
              {t('velumUi.server.checkAll')}
            </button>
            <button
              type="button"
              aria-label={t('common.close')}
              onClick={onClose}
              className="cursor-pointer rounded-lg p-1.5 text-vl-faint transition-colors hover:bg-white/5 hover:text-vl-text"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-3">
          <label className="flex items-center gap-2 rounded-xl border border-vl-line bg-vl-panel px-3 py-2">
            <Search className="size-3.5 text-vl-faint" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('velumUi.server.search')}
              className="w-full bg-transparent text-sm text-vl-text outline-none placeholder:text-vl-faint"
            />
          </label>
        </div>

        <div className="custom-scrollbar flex-1 space-y-1.5 overflow-y-auto px-4 pb-4">
          {visible.length === 0 && (
            <div className="py-10 text-center text-sm text-vl-muted">
              {t('velumUi.server.empty')}
            </div>
          )}
          {visible.map((entry) => {
            const selected = entry.name === servers.current?.name
            const busy = servers.testing.has(entry.name)
            return (
              <div
                key={entry.name}
                role="button"
                tabIndex={0}
                onClick={() => choose(entry)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') choose(entry)
                }}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                  selected
                    ? 'border-vl-accent/40 bg-vl-accent/10'
                    : 'border-vl-line bg-vl-tile hover:border-vl-line-strong'
                }`}
              >
                <CodeBadge entry={entry} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-vl-text">{entry.label}</div>
                  {entry.isAuto && (
                    <div className="truncate text-xs text-vl-muted">{t('velumUi.server.auto')}</div>
                  )}
                </div>
                <Ping delay={entry.delay} />
                {!entry.isAuto && (
                  <button
                    type="button"
                    title={t('velumUi.server.check')}
                    onClick={(e) => {
                      e.stopPropagation()
                      servers.testOne(entry.name)
                    }}
                    className="cursor-pointer rounded-md p-1 text-vl-faint transition-colors hover:text-vl-accent"
                  >
                    <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} />
                  </button>
                )}
                {selected && <Check className="size-4 shrink-0 text-vl-accent" />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
