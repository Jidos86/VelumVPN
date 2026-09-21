import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppConfig } from './hooks/use-app-config'
import { useControledMihomoConfig } from './hooks/use-controled-mihomo-config'
import { useGroups } from './hooks/use-groups'
import { mihomoCloseAllConnections, mihomoHotReloadConfig } from './utils/ipc'
import { calcTraffic } from './utils/calc'
import { useServers } from './velum/servers/use-servers'
import { bandColor, pingBand } from './velum/servers/server-utils'
import { ChevronDown } from 'lucide-react'

type RouteMode = 'blocked' | 'all-except-ru' | 'all'

interface TrafficData {
  up: number
  down: number
}

// The chips are short; the full name (same as on the home screen) is in the tooltip.
const ROUTE_MODES: { key: RouteMode; label: string; title: string }[] = [
  { key: 'blocked', label: 'velumUi.tray.modeBlocked', title: 'pages.home.routeMode.blocked' },
  {
    key: 'all-except-ru',
    label: 'velumUi.tray.modeForeign',
    title: 'pages.home.routeMode.allExceptRu'
  },
  { key: 'all', label: 'velumUi.tray.modeAll', title: 'pages.home.routeMode.all' }
]

const ipc = window.electron.ipcRenderer

// Compact tray card: state, main switch, current server, routing mode, speed and a way back to the window.
const TrayMenuApp: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig, mutateAppConfig, patchAppConfig } = useAppConfig()
  const { controledMihomoConfig, mutateControledMihomoConfig } = useControledMihomoConfig()
  const { mutate: mutateGroups } = useGroups()
  const { mainSwitchMode = 'tun', proxyMode = false, routeMode = 'blocked' } = appConfig || {}

  const enabled = mainSwitchMode === 'tun' ? (controledMihomoConfig?.tun?.enable ?? false) : proxyMode
  // Show the result of a click right away; the real value replaces it once the core has answered.
  const [optimisticOn, setOptimisticOn] = useState<boolean | null>(null)
  const [pendingMode, setPendingMode] = useState<RouteMode | null>(null)
  const [traffic, setTraffic] = useState<TrafficData>({ up: 0, down: 0 })
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const on = optimisticOn ?? enabled
  const shownMode = pendingMode ?? routeMode
  const servers = useServers()
  const [pickerOpen, setPickerOpen] = useState(false)

  const refresh = useCallback((): void => {
    mutateAppConfig()
    mutateControledMihomoConfig()
    mutateGroups()
    ipc
      .invoke('customTray:availableUpdate')
      .then((update: { version: string } | null) => setUpdateVersion(update?.version ?? null))
      .catch(() => setUpdateVersion(null))
  }, [mutateAppConfig, mutateControledMihomoConfig, mutateGroups])

  // The window lives on while hidden, so re-read everything each time it is shown.
  useEffect(() => {
    refresh()
    const onFocus = (): void => {
      setPickerOpen(false)
      refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  useEffect(() => {
    const onTraffic = (_e: unknown, info: TrafficData): void => setTraffic(info)
    ipc.on('mihomoTraffic', onTraffic)
    return () => {
      ipc.removeListener('mihomoTraffic', onTraffic)
    }
  }, [])

  // Keep the native window exactly as tall as the card (the update row comes and goes).
  useEffect(() => {
    const el = rootRef.current
    if (!el) return undefined
    const report = (): void => ipc.send('customTray:resize', el.getBoundingClientRect().height)
    const observer = new ResizeObserver(report)
    observer.observe(el)
    report()
    return () => observer.disconnect()
  }, [])

  const toggle = async (): Promise<void> => {
    if (optimisticOn !== null) return
    setOptimisticOn(!on)
    try {
      await ipc.invoke('customTray:toggle')
    } finally {
      refresh()
      setOptimisticOn(null)
    }
  }

  const changeMode = async (mode: RouteMode): Promise<void> => {
    if (mode === routeMode || pendingMode) return
    setPendingMode(mode)
    try {
      await patchAppConfig({ routeMode: mode })
      await mihomoHotReloadConfig()
      await mihomoCloseAllConnections()
      ipc.send('customTray:configChanged')
    } catch {
      // the chips fall back to the stored mode
    } finally {
      setPendingMode(null)
    }
  }

  return (
    // The window is transparent and a little wider than the card, so its shadow is not clipped.
    <div ref={rootRef} className="w-[260px] p-2.5">
      <div className="rounded-xl border border-vl-line-strong bg-vl-panel p-3.5 text-vl-text shadow-2xl shadow-black/50">
        <div className="mb-3 flex items-center gap-2">
          <span
            className="size-[7px] rounded-full transition-colors"
            style={{ background: on ? 'var(--color-vl-accent)' : 'rgb(242 245 248 / 0.3)' }}
          />
          <span className="text-[12.5px] font-bold">
            {on ? t('velumUi.tray.protected') : t('velumUi.tray.unprotected')}
          </span>
        </div>

        <button
          type="button"
          onClick={toggle}
          className="mb-2.5 flex w-full cursor-pointer items-center justify-between rounded-[9px] bg-vl-bg px-3 py-2.5 text-left"
        >
          <span className="text-xs font-semibold">
            {on ? t('velumUi.tray.turnOff') : t('velumUi.tray.turnOn')}
          </span>
          <span
            className={`relative h-[18px] w-8 rounded-full transition-colors ${on ? 'bg-vl-accent' : 'bg-white/15'}`}
          >
            <span
              className="absolute top-[2.5px] size-[13px] rounded-full bg-white transition-all duration-200"
              style={{ left: on ? 16.5 : 2.5 }}
            />
          </span>
        </button>

        <div className="mb-1 text-[11px] text-vl-faint">{t('velumUi.tray.server')}</div>
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          className="mb-2.5 flex w-full cursor-pointer items-center justify-between gap-2 text-left"
        >
          <span className="truncate text-[12.5px] font-semibold">
            {servers.current?.label ?? t('velumUi.server.choose')}
          </span>
          <ChevronDown
            className={`size-3.5 shrink-0 text-vl-faint transition-transform ${pickerOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {pickerOpen && (
          <div className="custom-scrollbar -mt-1 mb-2.5 max-h-44 space-y-0.5 overflow-y-auto rounded-lg bg-vl-bg p-1">
            {servers.entries.map((entry) => {
              const selected = entry.name === servers.current?.name
              return (
                <button
                  key={entry.name}
                  type="button"
                  onClick={async () => {
                    setPickerOpen(false)
                    try {
                      await servers.select(entry.name)
                    } catch {
                      // the card keeps showing the server that is really selected
                    }
                  }}
                  className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors ${
                    selected ? 'bg-vl-accent/14 text-vl-text' : 'text-vl-muted hover:bg-white/5 hover:text-vl-text'
                  }`}
                >
                  <span className="truncate">{entry.label}</span>
                  {entry.delay > 0 && (
                    <span className={`shrink-0 tabular-nums ${bandColor[pingBand(entry.delay)]}`}>
                      {entry.delay} ms
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        <div className="mb-3 flex gap-[5px]">
          {ROUTE_MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              title={t(m.title)}
              onClick={() => changeMode(m.key)}
              className={`flex-1 cursor-pointer rounded-md px-1 py-1.5 text-center text-[9.5px] font-bold transition-colors ${
                shownMode === m.key
                  ? 'bg-vl-accent/16 text-vl-accent'
                  : 'bg-white/5 text-vl-muted hover:text-vl-text'
              }`}
            >
              {t(m.label)}
            </button>
          ))}
        </div>

        <div className="flex justify-between border-t border-vl-line pt-2.5 text-[11px] tabular-nums text-vl-muted">
          <span>↓ {calcTraffic(traffic.down)}/s</span>
          <span>↑ {calcTraffic(traffic.up)}/s</span>
        </div>

        {updateVersion && (
          <button
            type="button"
            onClick={() => ipc.send('customTray:openMain')}
            className="mt-2.5 flex w-full cursor-pointer items-center gap-2 rounded-lg bg-vl-accent/12 px-2.5 py-2 text-left text-[11.5px] font-semibold text-vl-accent transition-colors hover:bg-vl-accent/18"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-vl-accent" />
            <span className="min-w-0 truncate">
              {t('velumUi.tray.update')} {updateVersion}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => ipc.send('customTray:openMain')}
          className="mt-2 block w-full cursor-pointer border-t border-vl-line py-1.5 text-left text-[11.5px] font-semibold text-vl-accent"
        >
          {t('velumUi.tray.open')}
        </button>
        <button
          type="button"
          onClick={() => ipc.send('customTray:quit')}
          className="block w-full cursor-pointer py-0.5 text-left text-[11.5px] font-semibold text-vl-muted transition-colors hover:text-vl-text"
        >
          {t('velumUi.tray.quit')}
        </button>
      </div>
    </div>
  )
}

export default TrayMenuApp
