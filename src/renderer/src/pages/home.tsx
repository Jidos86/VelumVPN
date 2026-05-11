import { toast } from 'sonner'
import BasePage from '@renderer/components/base/base-page'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useGroups } from '@renderer/hooks/use-groups'
import { triggerSysProxy, updateTrayIcon, mihomoHotReloadConfig, updateGeodata, mihomoCloseAllConnections } from '@renderer/utils/ipc'
import NumberFlow from '@number-flow/react'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import Power from '@renderer/assets/on_icon.svg'
import Pause from '@renderer/assets/pause_icon.svg'
import { InfinityIcon, WifiOff, PlusCircle, ChevronRight, Globe, ArrowUp, ArrowDown, RefreshCcw } from 'lucide-react'
import { SiTelegram } from 'react-icons/si'
import EditInfoModal from '@renderer/components/profiles/edit-info-modal'
import { Spinner } from '@renderer/components/ui/spinner'
import { CharacterMorph } from '@renderer/components/ui/character-morph'
import { calcTraffic } from '@renderer/utils/calc'
import { useTrafficStore } from '@renderer/store/traffic-store'

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`
}

// Module-level variable: persists across component mounts/unmounts
let connectionStartTime: number | null = null

const TEAL = 'oklch(0.82 0.16 196)'
const TEAL_DIM = 'oklch(0.75 0.19 196 / 20%)'
const TEAL_GLOW = '0 0 32px oklch(0.75 0.19 196 / 35%), 0 0 8px oklch(0.75 0.19 196 / 20%)'

const Home: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    mainSwitchMode = 'tun',
    sysProxy,
    proxyMode = false,
    onlyActiveDevice = false,
    routeMode = 'blocked'
  } = appConfig || {}
  const { enable: writeSysProxy = true, mode } = sysProxy || {}
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { tun } = controledMihomoConfig || {}
  const { 'mixed-port': mixedPort } = controledMihomoConfig || {}
  const sysProxyDisabled = mixedPort == 0

  const { profileConfig, addProfileItem } = useProfileConfig()
  const { groups } = useGroups()
  const navigate = useNavigate()
  const hasProfiles = (profileConfig?.items?.length ?? 0) > 0
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingItem, setEditingItem] = useState<ProfileItem | null>(null)
  const [updating, setUpdating] = useState(false)

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

  const status = loading
    ? loadingDirection === 'connecting'
      ? t('pages.home.connecting')
      : t('pages.home.disconnecting')
    : isSelected
      ? t('pages.home.connected')
      : t('pages.home.disconnected')
  const statusWidthTexts = [
    t('pages.home.connecting'),
    t('pages.home.disconnecting'),
    t('pages.home.connected'),
    t('pages.home.disconnected')
  ]
  const showConnectedTimer = !loading && isSelected
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

  const [geodataProgress, setGeodataProgress] = useState<number | null>(null)
  const [geodataFile, setGeodataFile] = useState('')
  const [geodataAuto, setGeodataAuto] = useState(false)

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

  const firstGroup = groups?.[0]
  const supportUrl = currentProfile?.supportUrl
  const supportLinkInfo = useMemo(() => {
    if (!supportUrl) return null
    try {
      const parsed = new URL(supportUrl)
      const normalized = `${parsed.hostname}${parsed.pathname}`.toLowerCase()
      return {
        href: parsed.toString(),
        isTelegram:
          parsed.protocol === 'tg:' || normalized.includes('t.me') || normalized.includes('telegram')
      }
    } catch {
      return null
    }
  }, [supportUrl])

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

  const routeModeLabels: Record<string, string> = {
    blocked: t('pages.home.routeMode.blocked'),
    'all-except-ru': t('pages.home.routeMode.allExceptRu'),
    all: t('pages.home.routeMode.all')
  }

  return (
    <BasePage>
      {!hasProfiles ? (
        /* ── Empty state ── */
        <div className="h-full w-full flex items-center justify-center">
          <div
            className="flex flex-col items-center gap-4 max-w-75 rounded-2xl p-8"
            style={{
              background: 'oklch(0.175 0.03 240)',
              border: '1px solid oklch(0.28 0.045 240)'
            }}
          >
            <WifiOff className="size-16" style={{ color: TEAL }} />
            <h2 className="text-xl font-bold text-foreground">{t('pages.profiles.emptyTitle')}</h2>
            <p className="text-sm font-medium text-muted-foreground text-center">
              {t('pages.profiles.emptyDescription')}
            </p>
            <button
              onClick={handleAddProfile}
              data-guide="home-add-profile-btn"
              className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all cursor-pointer"
              style={{
                background: TEAL_DIM,
                border: `1px solid ${TEAL}`,
                color: TEAL
              }}
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
      ) : (
        <div className="flex flex-col h-full px-3 pb-3 pt-1 gap-3">

          {/* ── Profile + subscription card ── */}
          {currentProfile && (
            <div
              className="rounded-2xl p-4"
              style={{
                background: 'oklch(0.175 0.03 240)',
                border: '1px solid oklch(0.28 0.045 240)'
              }}
            >
              {/* Profile name row */}
              <div
                data-guide="home-profile-header"
                className="flex items-center gap-2 mb-3"
              >
                {currentProfile.logo && (
                  <img
                    src={currentProfile.logo}
                    alt=""
                    className="w-8 h-8 rounded-full shrink-0"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                )}
                <span className="font-semibold text-sm flex-1 truncate">{currentProfile.name}</span>
                {currentProfile.type === 'remote' && (
                  <button
                    onClick={handleUpdateProfile}
                    disabled={updating}
                    className="p-1.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                    style={{ color: 'oklch(0.58 0.04 230)' }}
                    title="Обновить подписку"
                  >
                    <RefreshCcw className={`size-3.5 ${updating ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>

              {/* Subscription stats */}
              {subscription && (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div
                      className="flex flex-col items-center py-2 rounded-xl"
                      style={{ background: 'oklch(0.13 0.025 240)' }}
                    >
                      <span className="text-[10px] text-muted-foreground mb-0.5">
                        {t('pages.home.trafficRemaining')}
                      </span>
                      <span className="font-bold text-sm" style={{ color: TEAL }}>
                        {trafficTotal > 0 ? formatBytes(trafficRemaining) : <InfinityIcon className="size-4" />}
                      </span>
                    </div>
                    <div
                      className="flex flex-col items-center py-2 rounded-xl"
                      style={{ background: 'oklch(0.13 0.025 240)' }}
                    >
                      <span className="text-[10px] text-muted-foreground mb-0.5">
                        {t('pages.home.daysRemaining')}
                      </span>
                      <span className="font-bold text-sm" style={{ color: TEAL }}>
                        {expireTimestamp > 0 ? daysRemaining : <InfinityIcon className="size-4" />}
                      </span>
                    </div>
                    <div
                      className="flex flex-col items-center py-2 rounded-xl"
                      style={{ background: 'oklch(0.13 0.025 240)' }}
                    >
                      <span className="text-[10px] text-muted-foreground mb-0.5">
                        {t('pages.home.expires')}
                      </span>
                      <span className="font-bold text-sm text-foreground">{expireDate}</span>
                    </div>
                  </div>

                  {/* Traffic progress bar */}
                  {trafficTotal > 0 && (
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                        <span>{formatBytes(trafficUsed)} использовано</span>
                        <span>{formatBytes(trafficTotal)}</span>
                      </div>
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ background: 'oklch(0.13 0.025 240)' }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${trafficPercent}%`,
                            background: `linear-gradient(90deg, oklch(0.75 0.19 196), oklch(0.68 0.22 210))`
                          }}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Connect button area ── */}
          <div className="flex flex-col grow items-center justify-center min-h-0 gap-2">
            {/* Status label */}
            <div
              className="flex h-5 items-center justify-center transition-colors duration-300"
              style={{ color: isSelected ? TEAL : 'oklch(0.58 0.04 230)' }}
            >
              <CharacterMorph
                texts={[status]}
                reserveTexts={statusWidthTexts}
                interval={3000}
                className="h-5 leading-none text-xs font-semibold uppercase tracking-widest"
              />
            </div>

            {/* Power button */}
            <button
              disabled={isDisabled}
              onClick={() => onValueChange(!isSelected)}
              data-guide="home-power-toggle"
              className="relative group transition-transform active:scale-95 cursor-pointer my-1"
            >
              <div
                className="w-28 h-28 rounded-full flex items-center justify-center transition-all duration-400"
                style={{
                  background: isSelected
                    ? `radial-gradient(circle at 35% 40%, oklch(0.28 0.08 196), oklch(0.16 0.04 220))`
                    : `radial-gradient(circle at 35% 40%, oklch(0.22 0.04 240), oklch(0.14 0.025 240))`,
                  border: isSelected
                    ? `2px solid oklch(0.75 0.19 196 / 70%)`
                    : `2px solid oklch(0.28 0.045 240)`,
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
                      !loading && !isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                    }`}
                  />
                </div>
              </div>
            </button>

            {/* Timer */}
            <div className="h-7 flex items-center justify-center">
              <div
                aria-hidden={!showConnectedTimer}
                className={`inline-flex items-center gap-0.5 text-lg font-bold tabular-nums transition-all duration-300 ease-out ${
                  showConnectedTimer ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
                }`}
                style={{ color: TEAL }}
              >
                <NumberFlow value={elapsedHours} format={{ minimumIntegerDigits: 2, useGrouping: false }} />
                <span>:</span>
                <NumberFlow value={elapsedMinutes} format={{ minimumIntegerDigits: 2, useGrouping: false }} />
                <span>:</span>
                <NumberFlow value={elapsedSeconds} format={{ minimumIntegerDigits: 2, useGrouping: false }} />
              </div>
            </div>

            {/* Up/Down traffic */}
            <div
              aria-hidden={!showConnectedTimer}
              className={`flex items-center gap-4 tabular-nums transition-all duration-300 ease-out ${
                showConnectedTimer ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowUp className="size-3" style={{ color: TEAL }} />
                <span>{calcTraffic(trafficInfo.upTotal)}</span>
              </div>
              <div className="h-3 w-px" style={{ background: 'oklch(0.28 0.045 240)' }} />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowDown className="size-3" style={{ color: TEAL }} />
                <span>{calcTraffic(trafficInfo.downTotal)}</span>
              </div>
            </div>
          </div>

          {/* ── Route mode selector ── */}
          {currentProfile && (
            <div className="flex flex-col gap-2">
              <div
                className="flex rounded-xl p-1 gap-1"
                style={{
                  background: 'oklch(0.175 0.03 240)',
                  border: '1px solid oklch(0.28 0.045 240)'
                }}
              >
                {(['blocked', 'all-except-ru', 'all'] as const).map((m) => {
                  const active = routeMode === m
                  return (
                    <button
                      key={m}
                      disabled={routeLoading}
                      onClick={() => handleRouteModeChange(m)}
                      className={`flex-1 text-xs py-1.5 px-1 rounded-lg transition-all duration-200 cursor-pointer font-medium ${
                        routeLoading ? 'opacity-50' : ''
                      }`}
                      style={
                        active
                          ? {
                              background: `linear-gradient(135deg, oklch(0.75 0.19 196 / 22%), oklch(0.68 0.22 210 / 22%))`,
                              border: `1px solid oklch(0.75 0.19 196 / 50%)`,
                              color: TEAL
                            }
                          : {
                              background: 'transparent',
                              border: '1px solid transparent',
                              color: 'oklch(0.58 0.04 230)'
                            }
                      }
                    >
                      {routeModeLabels[m]}
                    </button>
                  )
                })}
              </div>

              {/* Geodata update */}
              {geodataProgress !== null ? (
                <div className="flex flex-col gap-1 px-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span className="truncate">
                      {geodataAuto
                        ? `Загрузка геоданных: ${geodataFile || '...'}`
                        : geodataFile || 'Загрузка...'}
                    </span>
                    <span>{geodataProgress}%</span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: 'oklch(0.22 0.04 240)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${geodataProgress}%`,
                        background: `linear-gradient(90deg, oklch(0.75 0.19 196), oklch(0.68 0.22 210))`
                      }}
                    />
                  </div>
                  {geodataAuto && (
                    <p className="text-[10px] text-center" style={{ color: 'oklch(0.48 0.04 230)' }}>
                      VPN будет доступен после завершения загрузки
                    </p>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleUpdateGeodata}
                  className="flex items-center justify-center gap-1.5 text-[11px] transition-colors py-0.5 cursor-pointer"
                  style={{ color: 'oklch(0.48 0.04 230)' }}
                >
                  <RefreshCcw className="size-3" />
                  Обновить геоданные
                </button>
              )}
            </div>
          )}

          {/* ── Server selector ── */}
          {firstGroup && (
            <div
              className="flex items-center justify-between h-10 rounded-xl px-3 cursor-pointer transition-all"
              data-guide="home-group-selector"
              style={{
                background: 'oklch(0.175 0.03 240)',
                border: '1px solid oklch(0.28 0.045 240)'
              }}
              onClick={() => navigate('/proxies', { state: { fromHome: true } })}
            >
              <span className="flag-emoji text-sm truncate max-w-52 text-foreground">
                {firstGroup.now || firstGroup.name}
              </span>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </div>
          )}

          {/* ── Support link ── */}
          {supportLinkInfo && (
            <div className="flex justify-center">
              <button
                data-guide="home-support-link"
                type="button"
                onClick={() => open(supportLinkInfo.href)}
                className="inline-flex items-center gap-1.5 text-xs transition-colors cursor-pointer"
                style={{ color: 'oklch(0.48 0.04 230)' }}
              >
                {supportLinkInfo.isTelegram ? (
                  <SiTelegram className="size-3.5" />
                ) : (
                  <Globe className="size-3.5" />
                )}
                <span>{t('pages.profiles.support')}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </BasePage>
  )
}

export default Home
