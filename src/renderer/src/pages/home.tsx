import { toast } from 'sonner'
import BasePage from '@renderer/components/base/base-page'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useGroups } from '@renderer/hooks/use-groups'
import { restartCore, triggerSysProxy } from '@renderer/utils/ipc'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import Power from '@renderer/assets/on_icon.svg'
import Pause from '@renderer/assets/pause_icon.svg'
import { InfinityIcon } from 'lucide-react'

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const Home: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    mainSwitchMode = 'tun',
    sysProxy,
    onlyActiveDevice = false,
  } = appConfig || {}
  const { enable: sysProxyEnable, mode } = sysProxy || {}
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { tun } = controledMihomoConfig || {}
  const { 'mixed-port': mixedPort } = controledMihomoConfig || {}
  const sysProxyDisabled = mixedPort == 0

  const { profileConfig } = useProfileConfig()
  const { groups } = useGroups()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [loadingDirection, setLoadingDirection] = useState<'connecting' | 'disconnecting'>(
    'connecting'
  )

  // Connection timer
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isSelected =
    mainSwitchMode === 'tun' ? (tun?.enable ?? false) : (sysProxyEnable ?? false)

  useEffect(() => {
    if (isSelected) {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1)
      }, 1000)
    } else {
      setElapsed(0)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isSelected])

  const isDisabled =
    loading || (mainSwitchMode === 'sysproxy' && mode == 'manual' && sysProxyDisabled)

  const status = loading
    ? loadingDirection === 'connecting'
      ? t('pages.home.connecting')
      : t('pages.home.disconnecting')
    : isSelected
      ? t('pages.home.connected')
      : t('pages.home.disconnected')

  // Current profile & subscription
  const currentProfile = useMemo(() => {
    if (!profileConfig?.current || !profileConfig?.items) return null
    return profileConfig.items.find((item) => item.id === profileConfig.current) ?? null
  }, [profileConfig])

  const subscription = currentProfile?.extra
  const trafficUsed = (subscription?.upload ?? 0) + (subscription?.download ?? 0)
  const trafficTotal = subscription?.total ?? 0
  const trafficRemaining = trafficTotal > 0 ? trafficTotal - trafficUsed : 0
  const expireTimestamp = subscription?.expire ?? 0
  const expireDate = expireTimestamp > 0 ? dayjs.unix(expireTimestamp).format('L') : t('pages.home.unlimited')
  const daysRemaining =
    expireTimestamp > 0 ? Math.max(0, dayjs.unix(expireTimestamp).diff(dayjs(), 'day')) : 0

  const firstGroup = groups?.[0]

  const onValueChange = async (enable: boolean): Promise<void> => {
    setLoading(true)
    setLoadingDirection(enable ? 'connecting' : 'disconnecting')
    try {
      if (mainSwitchMode === 'tun') {
        if (enable) {
          await patchControledMihomoConfig({ tun: { enable }, dns: { enable: true } })
        } else {
          await patchControledMihomoConfig({ tun: { enable } })
        }
        await restartCore()
        window.electron.ipcRenderer.send('updateFloatingWindow')
        window.electron.ipcRenderer.send('updateTrayMenu')
      } else {
        if (mode == 'manual' && sysProxyDisabled) return
        await triggerSysProxy(enable, onlyActiveDevice)
        await patchAppConfig({ sysProxy: { enable } })
        window.electron.ipcRenderer.send('updateFloatingWindow')
        window.electron.ipcRenderer.send('updateTrayMenu')
      }
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <BasePage>
      <div className="flex flex-col h-full px-2 pb-2 gap-4">
        {/* Profile card */}
        {currentProfile && (
          <div className="rounded-2xl border border-stroke bg-card/50 backdrop-blur-xl p-4">
            <div className="flex items-center justify-center gap-3 mb-2">
              {currentProfile.home && (
                <img
                  src={`https://www.google.com/s2/favicons?domain=${new URL(currentProfile.home).hostname}&sz=32`}
                  alt=""
                  className="w-10 h-10 rounded-full"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              )}
              <span className="font-medium text-base">{currentProfile.name}</span>
            </div>
            {currentProfile.announce && (
              <div className="text-sm font-medium text-center">
                {currentProfile.announce}
              </div>
            )}
            {/* Subscription info */}
          </div>
        )}
        {subscription && (
          <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center rounded-2xl border border-stroke bg-card/50 backdrop-blur-xl p-1 bg-background/50">
            <div className="flex flex-col items-center py-2 px-1">
              <span className="text-sm text-foreground">{t('pages.home.trafficRemaining')}</span>
              <span className="font-bold text-base mt-0.5">
                {trafficTotal > 0 ? formatBytes(trafficRemaining) : t('pages.home.unlimited')}
              </span>
            </div>
            <div className="h-8 w-px bg-stroke" />
            <div className="flex flex-col items-center py-2 px-1">
              <span className="text-sm text-foreground">{t('pages.home.daysRemaining')}</span>
              <span className="text-base font-bold mt-0.5">
                {expireTimestamp > 0 ? daysRemaining : <InfinityIcon />}
              </span>
            </div>
            <div className="h-8 w-px bg-stroke" />
            <div className="flex flex-col items-center py-2 px-1">
              <span className="text-sm text-foreground">{t('pages.home.expires')}</span>
              <span className="text-base font-bold mt-0.5">{expireDate}</span>
            </div>
          </div>
        )}

        {/* Connection button */}
        <div className="flex-1 flex flex-col grow-3 items-center justify-center gap-3 min-h-0">
          <span className={`text-foreground font-semibold uppercase tracking-wider`}>{status}</span>
          <button
            disabled={isDisabled}
            onClick={() => onValueChange(!isSelected)}
            className="relative group transition-transform active:scale-95"
          >
            <div
              className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 bg-radial-[at_30%_45%] backdrop-blur-xl border-2 ${
                isSelected
                  ? 'from-gradient-start-power-on/60 to-gradient-end-power-on/60 border-stroke-power-on'
                  : 'from-gradient-start-power-off/50 to-gradient-end-power-off/50 border-stroke-power-off'
              } ${loading ? 'animate-none' : ''}`}
            >
              {isSelected ? (
                <img src={Pause} alt="" className="w-20 h-20 fill-foreground" />
              ) : (
                <img src={Power} alt="" className="w-20 h-20 fill-foreground" />
              )}
            </div>
          </button>
          <span className="text-base font-bold text-foreground">{formatTimer(elapsed)}</span>
        </div>

        {/* Group & Proxy selectors */}
        {firstGroup && (
          <div className="flex flex-col grow items-center gap-3 pb-2 mx-auto w-full max-w-48">
            <div className="w-full cursor-pointer" onClick={() => navigate('/proxies')}>
              <div className="flex items-center h-9 rounded-2xl border border-stroke px-3 py-1 backdrop-blur-xl bg-card/50 text-sm">
                {firstGroup.now || '—'}
              </div>
            </div>
          </div>
        )}
      </div>
    </BasePage>
  )
}

export default Home
