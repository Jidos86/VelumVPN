import { toast } from 'sonner'
import useSWR, { useSWRConfig } from 'swr'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import {
  triggerSysProxy,
  updateTrayIcon,
  mihomoHotReloadConfig,
  updateGeodata,
  mihomoCloseAllConnections,
  getCustomRules,
  checkUpdate
} from '@renderer/utils/ipc'
import NumberFlow from '@number-flow/react'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { ArrowDown, ArrowUp, ChevronRight, InfinityIcon, PlusCircle, RefreshCcw, WifiOff } from 'lucide-react'
import { SiTelegram } from 'react-icons/si'
import EditInfoModal from '@renderer/components/profiles/edit-info-modal'
import { calcTraffic } from '@renderer/utils/calc'
import { useTrafficStore } from '@renderer/store/traffic-store'
import { ServerCard } from '@renderer/velum/servers/server-picker'
import UpdaterButton from '@renderer/components/updater/updater-button'
import { Switch } from '@renderer/velum/ui/primitives'
import { SIMULATED_UPDATE } from '@renderer/velum/dev/simulated-update'
import Power from '@renderer/assets/on_icon.svg'
import Pause from '@renderer/assets/pause_icon.svg'
import { Spinner } from '@renderer/components/ui/spinner'
import { CharacterMorph } from '@renderer/components/ui/character-morph'

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`
}

// Module-level variable: persists across component mounts/unmounts
let connectionStartTime: number | null = null

const TEAL = 'var(--color-vl-accent)'
const TEAL_GLOW = '0 0 26px oklch(0.82 0.16 196 / 16%)'

type Phase = 'off' | 'connecting' | 'disconnecting' | 'on'

const panel = 'rounded-2xl border border-vl-line bg-vl-panel'

const Home: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    mainSwitchMode = 'tun',
    expertMode = false,
    sysProxy,
    proxyMode = false,
    onlyActiveDevice = false,
    routeMode = 'blocked',
    routeModeNames = {}
  } = appConfig || {}
  const { enable: writeSysProxy = true, mode } = sysProxy || {}
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { tun } = controledMihomoConfig || {}
  const { 'mixed-port': mixedPort } = controledMihomoConfig || {}
  const sysProxyDisabled = mixedPort == 0

  const { profileConfig, addProfileItem } = useProfileConfig()
  const navigate = useNavigate()
  const hasProfiles = (profileConfig?.items?.length ?? 0) > 0
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingItem, setEditingItem] = useState<ProfileItem | null>(null)
  const [updating, setUpdating] = useState(false)
  const [geodataProgress, setGeodataProgress] = useState<number | null>(null)
  const [geodataFile, setGeodataFile] = useState('')
  const [geodataAuto, setGeodataAuto] = useState(false)

  const handleAddProfile = (): void => {
    const newProfile: ProfileItem = {
      id: '',
      name: '',
      type: 'remote',
      url: '',
      useProxy: false,
      autoUpdate: true
    }
    setEditingItem(newProfile)
    setShowEditModal(true)
  }

  const trafficInfo = useTrafficStore((s) => s.traffic)

  const [loading, setLoading] = useState(false)
  const [loadingDirection, setLoadingDirection] = useState<'connecting' | 'disconnecting'>(
    'connecting'
  )

  const [elapsed, setElapsed] = useState(() => {
    if (connectionStartTime !== null) {
      return Math.floor((Date.now() - connectionStartTime) / 1000)
    }
    return 0
  })

  const isSelected = (tun?.enable ?? false) || proxyMode

  useEffect(() => {
    if (isSelected) {
      if (connectionStartTime === null) {
        connectionStartTime = Date.now()
      }
      setElapsed(Math.floor((Date.now() - connectionStartTime) / 1000))
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - connectionStartTime!) / 1000))
      }, 1000)
      return () => clearInterval(interval)
    } else {
      connectionStartTime = null
      setElapsed(0)
      return undefined
    }
  }, [isSelected])

  const isDisabled =
    loading ||
    geodataProgress !== null ||
    (mainSwitchMode === 'sysproxy' && writeSysProxy && mode == 'manual' && sysProxyDisabled)

  const phase: Phase = loading
    ? loadingDirection === 'connecting'
      ? 'connecting'
      : 'disconnecting'
    : isSelected
      ? 'on'
      : 'off'
  const showConnectedTimer = phase === 'on'
  const elapsedHours = Math.floor(elapsed / 3600)
  const elapsedMinutes = Math.floor((elapsed % 3600) / 60)
  const elapsedSeconds = elapsed % 60

  const currentProfile = useMemo(() => {
    if (!profileConfig?.current || !profileConfig?.items) return null
    return profileConfig.items.find((item) => item.id === profileConfig.current) ?? null
  }, [profileConfig])

  const handleUpdateProfile = async (): Promise<void> => {
    if (!currentProfile || updating) return
    setUpdating(true)
    try {
      await addProfileItem(currentProfile)
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setUpdating(false)
    }
  }

  // Listen for geodata progress from both auto-download (startup) and manual update
  useEffect(() => {
    const handler = (_e: unknown, data: { file: string; progress: number; auto?: boolean }): void => {
      if (data.progress >= 100) {
        setGeodataProgress(null)
        setGeodataFile('')
        setGeodataAuto(false)
        if (!data.auto) toast.success('Геоданные обновлены')
      } else {
        setGeodataProgress(data.progress)
        setGeodataFile(data.file)
        setGeodataAuto(data.auto ?? false)
      }
    }
    window.electron.ipcRenderer.on('geodataProgress', handler)
    return () => {
      window.electron.ipcRenderer.removeListener('geodataProgress', handler)
    }
  }, [])

  const handleUpdateGeodata = async (): Promise<void> => {
    if (geodataProgress !== null) return
    setGeodataProgress(0)
    setGeodataAuto(false)
    try {
      await updateGeodata()
    } catch (e) {
      toast.error(`${e}`)
      setGeodataProgress(null)
      setGeodataFile('')
    }
  }

  const [routeLoading, setRouteLoading] = useState(false)
  const handleRouteModeChange = async (m: 'blocked' | 'all-except-ru' | 'all'): Promise<void> => {
    if (m === routeMode || routeLoading) return
    setRouteLoading(true)
    try {
      await patchAppConfig({ routeMode: m })
      await mihomoHotReloadConfig()
      await mihomoCloseAllConnections()
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRouteLoading(false)
    }
  }

  const subscription = currentProfile?.extra
  const trafficUsed = (subscription?.upload ?? 0) + (subscription?.download ?? 0)
  const trafficTotal = subscription?.total ?? 0
  const trafficPercent = trafficTotal > 0 ? Math.min(100, (trafficUsed / trafficTotal) * 100) : 0
  const trafficRemaining = trafficTotal > 0 ? trafficTotal - trafficUsed : 0
  const expireTimestamp = subscription?.expire ?? 0
  const expireDate = expireTimestamp > 0 ? dayjs.unix(expireTimestamp).format('L') : t('pages.home.never')
  const daysRemaining =
    expireTimestamp > 0 ? Math.max(0, dayjs.unix(expireTimestamp).diff(dayjs(), 'day')) : 0

  const { data: customRules } = useSWR('customRulesCount', getCustomRules)

  // App update: reuse the shared cache the app-level auto check fills; a manual check refreshes it.
  const { mutate } = useSWRConfig()
  const { data: latest } = useSWR<Awaited<ReturnType<typeof checkUpdate>>>(['checkUpdate'])
  const [checking, setChecking] = useState(false)
  const [upToDate, setUpToDate] = useState(false)
  const handleCheckUpdate = async (): Promise<void> => {
    setChecking(true)
    setUpToDate(false)
    try {
      // Dev aid: the manual check can be made to "find" a fake update (see velum/dev/simulated-update.ts).
      const res = SIMULATED_UPDATE ?? (await checkUpdate())
      await mutate(['checkUpdate'], res, { revalidate: false })
      if (!res) setUpToDate(true)
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setChecking(false)
    }
  }
  const rulesSummary = [
    {
      key: 'app',
      label: t('velumUi.rules.tabApps'),
      vpn: customRules?.processes.length ?? 0,
      direct: customRules?.excludedProcesses.length ?? 0
    },
    {
      key: 'domain',
      label: t('velumUi.rules.tabDomains'),
      vpn: customRules?.domains.length ?? 0,
      direct: customRules?.excluded.length ?? 0
    },
    {
      key: 'ip',
      label: t('velumUi.rules.tabIPs'),
      vpn: customRules?.ips.length ?? 0,
      direct: customRules?.excludedIPs.length ?? 0
    }
  ]

  const onValueChange = async (enable: boolean): Promise<void> => {
    setLoading(true)
    setLoadingDirection(enable ? 'connecting' : 'disconnecting')
    try {
      if (enable) {
        if (mainSwitchMode === 'tun') {
          await patchControledMihomoConfig({ tun: { enable: true }, dns: { enable: true } })
          await mihomoHotReloadConfig()
        } else {
          if (writeSysProxy && mode == 'manual' && sysProxyDisabled) return
          await patchAppConfig({ proxyMode: true })
          await mihomoHotReloadConfig()
          if (writeSysProxy) {
            await triggerSysProxy(true, onlyActiveDevice)
          }
        }
      } else {
        const tunWasEnabled = tun?.enable ?? false
        const proxyModeWasEnabled = proxyMode
        if (tunWasEnabled) {
          await patchControledMihomoConfig({ tun: { enable: false } })
        }
        if (proxyModeWasEnabled) {
          if (writeSysProxy) {
            await triggerSysProxy(false, onlyActiveDevice)
          }
          await patchAppConfig({ proxyMode: false })
        }
        if (tunWasEnabled || proxyModeWasEnabled) {
          await mihomoHotReloadConfig()
        }
      }
      window.electron.ipcRenderer.send('updateFloatingWindow')
      window.electron.ipcRenderer.send('updateTrayMenu')
      await updateTrayIcon()
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setLoading(false)
    }
  }

  const routeModes = [
    {
      key: 'blocked' as const,
      label: routeModeNames?.blocked || t('pages.home.routeMode.blocked'),
      desc: t('velumUi.routing.blockedDesc')
    },
    {
      key: 'all-except-ru' as const,
      label: routeModeNames?.['all-except-ru'] || t('pages.home.routeMode.allExceptRu'),
      desc: t('velumUi.routing.allExceptRuDesc')
    },
    {
      key: 'all' as const,
      label: routeModeNames?.all || t('pages.home.routeMode.all'),
      desc: t('velumUi.routing.allDesc')
    }
  ]

  if (!hasProfiles) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className={`${panel} flex max-w-xs flex-col items-center gap-4 p-8`}>
          <WifiOff className="size-14 text-vl-accent" strokeWidth={1.5} />
          <h2 className="text-lg font-bold text-vl-text">{t('pages.profiles.emptyTitle')}</h2>
          <p className="text-center text-sm font-medium text-vl-muted">
            {t('pages.profiles.emptyDescription')}
          </p>
          <button
            onClick={handleAddProfile}
            data-guide="home-add-profile-btn"
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-vl-accent bg-vl-accent/15 px-6 py-3 text-sm font-semibold text-vl-accent transition-colors hover:bg-vl-accent/25"
          >
            <PlusCircle className="size-5" />
            <span>{t('pages.profiles.addProfile')}</span>
          </button>
        </div>
        {showEditModal && editingItem && (
          <EditInfoModal
            item={editingItem}
            isCurrent={false}
            updateProfileItem={async (item: ProfileItem) => {
              await addProfileItem(item)
              setShowEditModal(false)
              setEditingItem(null)
            }}
            onClose={() => {
              setShowEditModal(false)
              setEditingItem(null)
            }}
          />
        )}
      </div>
    )
  }

  // Status label above the button (same texts as before the redesign).
  const status =
    phase === 'connecting'
      ? t('pages.home.connecting')
      : phase === 'disconnecting'
        ? t('pages.home.disconnecting')
        : phase === 'on'
          ? t('pages.home.connected')
          : t('pages.home.disconnected')
  const statusWidthTexts = [
    t('pages.home.connecting'),
    t('pages.home.disconnecting'),
    t('pages.home.connected'),
    t('pages.home.disconnected')
  ]

  return (
    // One shared grid so left and right blocks line up row by row (title / connect + subscription /
    // server + support / routing); the section/aside wrappers only group the code.
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_18rem] grid-rows-[auto_1fr_auto_auto] gap-x-5 gap-y-4 overflow-y-auto p-5">
      {/* ── Main column ── */}
      <section className="contents">
        <h1 className="col-span-2 row-start-1 text-xl font-extrabold text-vl-text">{t('sider.home')}</h1>

        <div className={`${panel} col-start-1 row-start-2 flex flex-col items-center justify-center gap-2 overflow-hidden px-6 py-8`}>
          {/* Status label */}
          <div
            className="flex h-5 items-center justify-center transition-colors duration-300"
            style={{ color: isSelected ? TEAL : 'var(--color-vl-muted)' }}
          >
            <CharacterMorph
              texts={[status]}
              reserveTexts={statusWidthTexts}
              interval={3000}
              className="h-5 leading-none text-xs font-semibold uppercase tracking-widest"
            />
          </div>

          {/* Power button (original look) */}
          <button
            disabled={isDisabled}
            onClick={() => onValueChange(!isSelected)}
            data-guide="home-power-toggle"
            className="relative group my-1 cursor-pointer transition-transform active:scale-95 disabled:cursor-default"
          >
            <div
              className="w-28 h-28 rounded-full flex items-center justify-center transition-all duration-400"
              style={{
                // Same shape as the original button, recoloured to the new palette
                // (panel/tile navy when off, the accent teal when connected).
                background: isSelected
                  ? `radial-gradient(circle at 35% 40%, #17232d, #0e151f)`
                  : `radial-gradient(circle at 35% 40%, #182131, #0d121b)`,
                border: isSelected
                  ? `2px solid oklch(0.82 0.16 196 / 50%)`
                  : `2px solid rgb(255 255 255 / 0.1)`,
                boxShadow: isSelected ? TEAL_GLOW : 'none'
              }}
            >
              <div className="relative size-14">
                <Spinner
                  className={`absolute inset-0 m-auto size-14 transition-all duration-300 ease-out ${
                    loading ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                  }`}
                  style={{ color: TEAL }}
                />
                <img
                  src={Pause}
                  alt=""
                  className={`absolute inset-0 size-14 transition-all duration-300 ease-out ${
                    !loading && isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                  }`}
                />
                <img
                  src={Power}
                  alt=""
                  className={`absolute inset-0 size-14 transition-all duration-300 ease-out ${
                    !loading && !isSelected ? 'opacity-70 scale-100' : 'opacity-0 scale-90'
                  }`}
                />
              </div>
            </div>
          </button>

          {/* Timer + traffic while connected, a short hint otherwise */}
          <div className="flex min-h-14 flex-col items-center justify-start gap-1.5 tabular-nums">
            {showConnectedTimer ? (
              <>
                <div
                  className="inline-flex items-center gap-0.5 text-lg font-semibold"
                  style={{ color: TEAL }}
                >
                  <NumberFlow value={elapsedHours} format={{ minimumIntegerDigits: 2, useGrouping: false }} />
                  <span>:</span>
                  <NumberFlow value={elapsedMinutes} format={{ minimumIntegerDigits: 2, useGrouping: false }} />
                  <span>:</span>
                  <NumberFlow value={elapsedSeconds} format={{ minimumIntegerDigits: 2, useGrouping: false }} />
                </div>
                <div className="flex items-center gap-4 text-xs text-vl-muted">
                  <span className="flex items-center gap-1.5">
                    <ArrowUp className="size-3" style={{ color: TEAL }} />
                    {calcTraffic(trafficInfo.upTotal)}
                  </span>
                  <span className="h-3 w-px bg-vl-line-strong" />
                  <span className="flex items-center gap-1.5">
                    <ArrowDown className="size-3" style={{ color: TEAL }} />
                    {calcTraffic(trafficInfo.downTotal)}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-sm text-vl-muted">{t(`velumUi.status.${phase}Sub`)}</div>
            )}
          </div>
        </div>

        <div className="col-start-1 row-start-3 flex [&>button]:flex-1">
          <ServerCard />
        </div>

        <div className="col-start-1 row-start-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-vl-faint">
            {t('velumUi.routing.title')}
          </div>
          <div className="flex flex-col gap-1.5">
            {routeModes.map((m) => {
              const active = routeMode === m.key
              return (
                <button
                  key={m.key}
                  type="button"
                  disabled={routeLoading}
                  onClick={() => handleRouteModeChange(m.key)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                    active
                      ? 'border-vl-accent/35 bg-vl-accent/10'
                      : 'border-vl-line bg-vl-panel hover:border-vl-line-strong'
                  } ${routeLoading ? 'opacity-60' : ''}`}
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                      active ? 'border-vl-accent' : 'border-white/25'
                    }`}
                  >
                    {active && <span className="size-2 rounded-full bg-vl-accent" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-vl-text">{m.label}</span>
                    <span className="block truncate text-xs text-vl-muted">{m.desc}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Side column ── */}
      <aside className="contents">
        <div className="col-start-2 row-start-2 flex flex-col gap-4">
        {currentProfile && (
          <div className={`${panel} p-4`}>
            <div data-guide="home-profile-header" className="mb-3 flex items-center gap-2">
              {currentProfile.logo && (
                <img
                  src={currentProfile.logo}
                  alt=""
                  className="size-6 shrink-0 rounded-full"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-vl-faint">
                  {t('velumUi.subscription.title')}
                </div>
                <div className="truncate text-sm font-bold text-vl-text">{currentProfile.name}</div>
              </div>
              {currentProfile.type === 'remote' && (
                <button
                  type="button"
                  onClick={handleUpdateProfile}
                  disabled={updating}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-vl-accent transition-colors hover:bg-white/5 disabled:opacity-50"
                >
                  <RefreshCcw className={`size-3 ${updating ? 'animate-spin' : ''}`} />
                  {t('velumUi.subscription.refresh')}
                </button>
              )}
            </div>

            {subscription && (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-vl-muted">{t('pages.home.trafficRemaining')}</span>
                  <span className="font-bold text-vl-text">
                    {trafficTotal > 0 ? formatBytes(trafficRemaining) : <InfinityIcon className="size-4" />}
                  </span>
                </div>
                {trafficTotal > 0 && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-vl-accent transition-all duration-500"
                      style={{ width: `${trafficPercent}%` }}
                    />
                  </div>
                )}
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-semibold leading-none text-vl-text">
                      {expireTimestamp > 0 ? daysRemaining : <InfinityIcon className="size-6" />}
                    </div>
                    <div className="mt-1 text-[11px] text-vl-muted">{t('velumUi.subscription.daysLeft')}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-vl-text">{expireDate}</div>
                    <div className="mt-1 text-[11px] text-vl-muted">{t('velumUi.subscription.expires')}</div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => navigate('/custom-rules')}
          className={`${panel} flex flex-1 cursor-pointer flex-col gap-3 p-4 text-left transition-colors hover:border-vl-line-strong`}
        >
          <div className="flex w-full items-center justify-between">
            <div className="text-sm font-bold text-vl-text">{t('sider.myRules')}</div>
            <ChevronRight className="size-4 text-vl-faint" />
          </div>
          <div className="flex w-full flex-col gap-1.5 text-xs tabular-nums">
            {rulesSummary.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3">
                <span className="text-vl-muted">{row.label}</span>
                <span className="flex items-center gap-3">
                  <span className={row.vpn > 0 ? 'text-vl-text' : 'text-vl-faint'}>
                    <span className="text-vl-accent">{t('velumUi.rules.summaryVpn')}</span> {row.vpn}
                  </span>
                  <span className="h-3 w-px bg-vl-line-strong" />
                  <span className={row.direct > 0 ? 'text-vl-text' : 'text-vl-faint'}>
                    <span className="text-vl-muted">{t('velumUi.rules.summaryDirect')}</span> {row.direct}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </button>
        </div>

        <button
          type="button"
          data-guide="home-support-link"
          onClick={() => open('https://t.me/Veluum_support_bot')}
          className={`${panel} col-start-2 row-start-3 flex cursor-pointer items-center gap-3 p-4 text-left transition-colors hover:border-vl-line-strong`}
        >
          <SiTelegram className="size-4 shrink-0 text-vl-accent" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-vl-text">{t('pages.profiles.support')}</div>
            <div className="truncate text-xs text-vl-muted">Telegram</div>
          </div>
        </button>
        {/* Updates, right of the routing modes: separate tiles in the same style/height as the
            routing cards, top-aligned with the first one (mt-6 = the "routing mode" caption). */}
        <div className="col-start-2 row-start-4 mt-6 flex flex-col gap-1.5 self-start">
          <button
            type="button"
            disabled={geodataProgress !== null}
            onClick={handleUpdateGeodata}
            className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-vl-line bg-vl-panel px-3.5 py-2.5 text-left transition-colors hover:border-vl-line-strong disabled:cursor-default"
          >
            <RefreshCcw className={`size-4 shrink-0 text-vl-muted ${geodataProgress !== null ? 'animate-spin' : ''}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-vl-text">
                {t('velumUi.update.geodata')}
              </span>
              {geodataProgress !== null ? (
                <span className="mt-1 block">
                  <span className="flex justify-between text-[11px] text-vl-muted">
                    <span className="truncate">{geodataFile || '...'}</span>
                    <span>{geodataProgress}%</span>
                  </span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/8">
                    <span
                      className="block h-full rounded-full bg-vl-accent transition-all duration-300"
                      style={{ width: `${geodataProgress}%` }}
                    />
                  </span>
                  {geodataAuto && (
                    <span className="mt-1 block text-[11px] text-vl-faint">
                      VPN будет доступен после завершения загрузки
                    </span>
                  )}
                </span>
              ) : (
                <span className="block truncate text-xs text-vl-muted">
                  {t('velumUi.update.geodataDesc')}
                </span>
              )}
            </span>
          </button>

          {latest ? (
            <UpdaterButton
              latest={latest}
              variant="card"
              label={t('velumUi.update.install')}
              sublabel={t('velumUi.update.available', { version: latest.version })}
            />
          ) : (
            <button
              type="button"
              disabled={checking}
              onClick={handleCheckUpdate}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-vl-line bg-vl-panel px-3.5 py-2.5 text-left transition-colors hover:border-vl-line-strong disabled:cursor-default"
            >
              <RefreshCcw className={`size-4 shrink-0 text-vl-muted ${checking ? 'animate-spin' : ''}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-vl-text">
                  {checking ? t('velumUi.update.checking') : t('velumUi.update.check')}
                </span>
                <span className="block truncate text-xs text-vl-muted">
                  {upToDate ? t('velumUi.update.upToDate') : t('velumUi.update.checkDesc')}
                </span>
              </span>
            </button>
          )}

          {/* Expert mode: same switch as in Settings > App, kept handy here */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => patchAppConfig({ expertMode: !expertMode })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') patchAppConfig({ expertMode: !expertMode })
            }}
            className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-vl-line bg-vl-panel px-3.5 py-2.5 text-left transition-colors hover:border-vl-line-strong"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-vl-text">
                {t('settings.general.expertMode')}
              </span>
              <span className="block truncate text-xs text-vl-muted">
                {t('settings.general.expertModeDesc')}
              </span>
            </span>
            <span onClick={(e) => e.stopPropagation()}>
              <Switch
                checked={expertMode}
                onChange={(value) => patchAppConfig({ expertMode: value })}
                label={t('settings.general.expertMode')}
              />
            </span>
          </div>
        </div>
      </aside>
    </div>
  )
}

export default Home
