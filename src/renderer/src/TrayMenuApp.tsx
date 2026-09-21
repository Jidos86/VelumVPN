import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, RefreshCw } from 'lucide-react'
import { useAppConfig } from './hooks/use-app-config'
import { useControledMihomoConfig } from './hooks/use-controled-mihomo-config'
import { useGroups } from './hooks/use-groups'
import { mihomoCloseAllConnections, mihomoHotReloadConfig } from './utils/ipc'
import { calcTraffic } from './utils/calc'
import { useServers } from './velum/servers/use-servers'
import { bandColor, pingBand } from './velum/servers/server-utils'

type RouteMode = 'blocked' | 'all-except-ru' | 'all'
type Side = 'left' | 'right'

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

// Sizes must match the native window: the card is 260 wide including its 10px margin, the server
// list next to it is 250 wide including its own margin.
const CARD_W = 260
const FLYOUT_W = 250
const FLYOUT_LIST_MAX = 300
const FLYOUT_ROW_H = 30
// header row + separator + paddings of the list panel and the window margin
const FLYOUT_CHROME = 100
// how long the pointer may be outside both the row and the list before the list closes
const FLYOUT_CLOSE_MS = 180

const ipc = window.electron.ipcRenderer

// Compact tray card: state, main switch, current server, routing mode, speed and a way back to the window.
// The server list flies out next to the card while the pointer is on the server row, like a submenu.
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
  const servers = useServers()
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const [side, setSide] = useState<Side>('left')
  const [cardHeight, setCardHeight] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const on = optimisticOn ?? enabled
  const shownMode = pendingMode ?? routeMode

  const refresh = useCallback((): void => {
    mutateAppConfig()
    mutateControledMihomoConfig()
    mutateGroups()
    ipc
      .invoke('customTray:availableUpdate')
      .then((update: { version: string } | null) => setUpdateVersion(update?.version ?? null))
      .catch(() => setUpdateVersion(null))
  }, [mutateAppConfig, mutateControledMihomoConfig, mutateGroups])

  const openFlyout = (): void => {
    clearTimeout(closeTimer.current)
    setFlyoutOpen(true)
  }
  const scheduleCloseFlyout = (): void => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setFlyoutOpen(false), FLYOUT_CLOSE_MS)
  }

  // The window lives on while hidden, so re-read everything each time it is shown.
  useEffect(() => {
    refresh()
    const onFocus = (): void => {
      clearTimeout(closeTimer.current)
      setFlyoutOpen(false)
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

  // Measure the card (the update row comes and goes).
  useEffect(() => {
    const el = cardRef.current
    if (!el) return undefined
    const observer = new ResizeObserver(() => setCardHeight(Math.ceil(el.getBoundingClientRect().height)))
    observer.observe(el)
    setCardHeight(Math.ceil(el.getBoundingClientRect().height))
    return () => observer.disconnect()
  }, [])

  // Tell the native window how big it has to be. setBounds on its side moves the window so the card
  // stays where it is, and the answer says which side of the card has room for the list.
  const listHeight = Math.min(FLYOUT_LIST_MAX, servers.entries.length * FLYOUT_ROW_H)
  const flyoutHeight = flyoutOpen ? listHeight + FLYOUT_CHROME : 0
  useEffect(() => {
    if (!cardHeight) return
    ipc
      .invoke('customTray:layout', {
        width: flyoutOpen ? CARD_W + FLYOUT_W : CARD_W,
        height: Math.max(cardHeight, flyoutHeight)
      })
      .then((next: Side) => setSide(next))
      .catch(() => {})
  }, [cardHeight, flyoutOpen, flyoutHeight])

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

  const flyout = flyoutOpen && (
    <div
      className={`shrink-0 p-2.5 ${side === 'left' ? 'pr-0' : 'pl-0'}`}
      style={{ width: FLYOUT_W }}
      onMouseEnter={openFlyout}
      onMouseLeave={scheduleCloseFlyout}
    >
      <div className="rounded-xl border border-vl-line-strong bg-vl-panel p-1.5 text-vl-text shadow-2xl shadow-black/50">
        <button
          type="button"
          disabled={servers.testingAll}
          onClick={() => servers.testAll()}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] font-semibold text-vl-accent transition-colors hover:bg-white/5 disabled:opacity-60"
        >
          <RefreshCw className={`size-3 ${servers.testingAll ? 'animate-spin' : ''}`} />
          {t('velumUi.tray.retest')}
        </button>
        <div className="mx-1.5 my-1 border-t border-vl-line" />
        <div className="custom-scrollbar overflow-y-auto" style={{ maxHeight: FLYOUT_LIST_MAX }}>
          {servers.entries.map((entry) => {
            const selected = entry.name === servers.current?.name
            return (
              <button
                key={entry.name}
                type="button"
                onClick={async () => {
                  setFlyoutOpen(false)
                  try {
                    await servers.select(entry.name)
                  } catch {
                    // the card keeps showing the server that is really selected
                  }
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-[11.5px] transition-colors hover:bg-white/5"
                style={{ height: FLYOUT_ROW_H }}
              >
                <span
                  className={`flex size-3.5 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                    selected ? 'border-vl-accent' : 'border-white/25'
                  }`}
                >
                  {selected && <span className="size-1.5 rounded-full bg-vl-accent" />}
                </span>
                <span className={`min-w-0 flex-1 truncate ${selected ? 'font-semibold text-vl-text' : 'text-vl-muted'}`}>
                  {entry.label}
                </span>
                {entry.delay > 0 && (
                  <span className={`shrink-0 text-[10.5px] tabular-nums ${bandColor[pingBand(entry.delay)]}`}>
                    {entry.delay} ms
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )

  return (
    // The window is transparent: the card and the list are drawn on the bottom edge, and the window
    // grows sideways/upwards around them, so nothing moves when the list opens.
    <div className="flex items-end" style={{ width: flyoutOpen ? CARD_W + FLYOUT_W : CARD_W }}>
      {side === 'left' && flyout}
      <div ref={cardRef} className="shrink-0 p-2.5" style={{ width: CARD_W }}>
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
            onMouseEnter={openFlyout}
            onMouseLeave={scheduleCloseFlyout}
            onClick={openFlyout}
            className={`-mx-1.5 mb-2.5 flex w-[calc(100%+12px)] cursor-pointer items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left transition-colors ${
              flyoutOpen ? 'bg-white/6' : 'hover:bg-white/5'
            }`}
          >
            <span className="truncate text-[12.5px] font-semibold">
              {servers.current?.label ?? t('velumUi.server.choose')}
            </span>
            <ChevronRight
              className={`size-3.5 shrink-0 text-vl-faint transition-transform ${
                flyoutOpen ? (side === 'left' ? 'rotate-180' : '') : ''
              }`}
            />
          </button>

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
      {side === 'right' && flyout}
    </div>
  )
}

export default TrayMenuApp
