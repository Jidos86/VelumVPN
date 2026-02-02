import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { NavigateFunction, useLocation, useNavigate, useRoutes } from 'react-router-dom'
import './i18n'
import { useTranslation } from 'react-i18next'
import OutboundModeSwitcher from '@renderer/components/sider/outbound-mode-switcher'
import { Button, Divider } from '@heroui/react'
import { IoSettings } from 'react-icons/io5'
import routes from '@renderer/routes'
import ProfileCard from '@renderer/components/sider/profile-card'
import ProxyCard from '@renderer/components/sider/proxy-card'
import RuleCard from '@renderer/components/sider/rule-card'
import ConnCard from '@renderer/components/sider/conn-card'
import LogCard from '@renderer/components/sider/log-card'
import UpdaterButton from '@renderer/components/updater/updater-button'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { applyTheme, checkUpdate, needsFirstRunAdmin, restartAsAdmin, setNativeTheme, setTitleBarOverlay } from '@renderer/utils/ipc'
import { platform } from '@renderer/utils/init'
import { TitleBarOverlayOptions } from 'electron'
import MihomoIcon from './components/base/mihomo-icon'
import useSWR from 'swr'
import ConfirmModal from '@renderer/components/base/base-confirm'
import MainCard from '@renderer/components/sider/main-card'

let navigate: NavigateFunction

const defaultSiderOrder = [
  'main',
  'proxy',
  'connection',
  'profile',
  'rule',
  'log'
]

const App: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig } = useAppConfig()
  const {
    appTheme = 'system',
    customTheme,
    useWindowFrame = false,
    autoCheckUpdate,
    updateChannel = 'stable'
  } = appConfig || {}
  const narrowWidth = platform === 'darwin' ? 70 : 60
  const { setTheme, systemTheme } = useTheme()
  navigate = useNavigate()
  const location = useLocation()
  const page = useRoutes(routes)
  const setTitlebar = (): void => {
    if (!useWindowFrame && platform !== 'darwin') {
      const options = { height: 48 } as TitleBarOverlayOptions
      try {
        options.color = window.getComputedStyle(document.documentElement).backgroundColor
        options.symbolColor = window.getComputedStyle(document.documentElement).color
        setTitleBarOverlay(options)
      } catch {
        // ignore
      }
    }
  }
  const { data: latest } = useSWR(
    autoCheckUpdate ? ['checkUpdate', updateChannel] : undefined,
    autoCheckUpdate ? checkUpdate : (): undefined => {},
    {
      refreshInterval: 1000 * 60 * 10
    }
  )

  useEffect(() => {
    const tourShown = window.localStorage.getItem('tourShown')
    if (!tourShown) {
      window.localStorage.setItem('tourShown', 'true')
      import('@renderer/utils/driver').then(({ startTour }) => {
        startTour(navigate)
      })
    }
  }, [])

  useEffect(() => {
    setNativeTheme(appTheme)
    setTheme(appTheme)
    setTitlebar()
  }, [appTheme, systemTheme])

  useEffect(() => {
    applyTheme(customTheme || 'default.css').then(() => {
      setTitlebar()
    })
  }, [customTheme])

  const componentMap = {
    main: MainCard,
    profile: ProfileCard,
    proxy: ProxyCard,
    connection: ConnCard,
    log: LogCard,
    rule: RuleCard
  }

  const [showQuitConfirm, setShowQuitConfirm] = useState(false)
  const [showProfileInstallConfirm, setShowProfileInstallConfirm] = useState(false)
  const [showOverrideInstallConfirm, setShowOverrideInstallConfirm] = useState(false)
  const [showAdminRequired, setShowAdminRequired] = useState(false)
  const [profileInstallData, setProfileInstallData] = useState<{
    url: string
    name?: string | null
  }>()
  const [overrideInstallData, setOverrideInstallData] = useState<{
    url: string
    name?: string | null
  }>()

  useEffect(() => {
    const handleShowQuitConfirm = (): void => {
      setShowQuitConfirm(true)
    }
    const handleShowProfileInstallConfirm = (
      _event: unknown,
      data: { url: string; name?: string | null }
    ): void => {
      setProfileInstallData(data)
      setShowProfileInstallConfirm(true)
    }
    const handleShowOverrideInstallConfirm = (
      _event: unknown,
      data: { url: string; name?: string | null }
    ): void => {
      setOverrideInstallData(data)
      setShowOverrideInstallConfirm(true)
    }

    window.electron.ipcRenderer.on('show-quit-confirm', handleShowQuitConfirm)
    window.electron.ipcRenderer.on('show-profile-install-confirm', handleShowProfileInstallConfirm)
    window.electron.ipcRenderer.on(
      'show-override-install-confirm',
      handleShowOverrideInstallConfirm
    )

    const handleNeedsAdminSetup = (): void => {
      setShowAdminRequired(true)
    }
    window.electron.ipcRenderer.on('needs-admin-setup', handleNeedsAdminSetup)

    if (platform === 'win32') {
      needsFirstRunAdmin().then((needs) => {
        if (needs) setShowAdminRequired(true)
      })
    }

    return (): void => {
      window.electron.ipcRenderer.removeAllListeners('show-quit-confirm')
      window.electron.ipcRenderer.removeAllListeners('show-profile-install-confirm')
      window.electron.ipcRenderer.removeAllListeners('show-override-install-confirm')
      window.electron.ipcRenderer.removeAllListeners('needs-admin-setup')
    }
  }, [])

  const handleQuitConfirm = (confirmed: boolean): void => {
    setShowQuitConfirm(false)
    window.electron.ipcRenderer.send('quit-confirm-result', confirmed)
  }

  const handleProfileInstallConfirm = (confirmed: boolean): void => {
    setShowProfileInstallConfirm(false)
    window.electron.ipcRenderer.send('profile-install-confirm-result', confirmed)
  }

  const handleOverrideInstallConfirm = (confirmed: boolean): void => {
    setShowOverrideInstallConfirm(false)
    window.electron.ipcRenderer.send('override-install-confirm-result', confirmed)
  }

  return (
    <div className={`w-full h-screen flex`}>
      {showQuitConfirm && (
        <ConfirmModal
          title={t('modal.confirmQuit')}
          description={
            <div>
              <p></p>
              <p className="text-sm text-gray-500 mt-2">{t('modal.quitWarning')}</p>
              <p className="text-sm text-gray-400 mt-1">
                {t('modal.quickQuitHint')} {platform === 'darwin' ? '⌘Q' : 'Ctrl+Q'} {t('modal.canQuitDirectly')}
              </p>
            </div>
          }
          confirmText={t('common.quit')}
          cancelText={t('common.cancel')}
          onChange={(open) => {
            if (!open) {
              handleQuitConfirm(false)
            }
          }}
          onConfirm={() => handleQuitConfirm(true)}
        />
      )}
      {showProfileInstallConfirm && profileInstallData && (
        <ConfirmModal
          title={t('modal.confirmImportProfile')}
          description={
            <div>
              <p className="text-sm text-gray-600 mb-2">
                {t('modal.nameLabel')}{profileInstallData.name || t('common.unnamed')}
              </p>
              <p className="text-sm text-gray-600 mb-2">{t('modal.linkLabel')}{profileInstallData.url}</p>
              <p className="text-sm text-orange-500 mt-2">
                {t('modal.ensureTrustedSource')}
              </p>
            </div>
          }
          confirmText={t('common.import')}
          cancelText={t('common.cancel')}
          onChange={(open) => {
            if (!open) {
              handleProfileInstallConfirm(false)
            }
          }}
          onConfirm={() => handleProfileInstallConfirm(true)}
          className="w-[500px]"
        />
      )}
      {showOverrideInstallConfirm && overrideInstallData && (
        <ConfirmModal
          title={t('modal.confirmImportOverride')}
          description={
            <div>
              <p className="text-sm text-gray-600 mb-2">
                {t('modal.nameLabel')}{overrideInstallData.name || t('common.unnamed')}
              </p>
              <p className="text-sm text-gray-600 mb-2">{t('modal.linkLabel')}{overrideInstallData.url}</p>
              <p className="text-sm text-orange-500 mt-2">
                {t('modal.ensureTrustedOverride')}
              </p>
            </div>
          }
          confirmText={t('common.import')}
          cancelText={t('common.cancel')}
          onChange={(open) => {
            if (!open) {
              handleOverrideInstallConfirm(false)
            }
          }}
          onConfirm={() => handleOverrideInstallConfirm(true)}
        />
      )}
      {showAdminRequired && (
        <ConfirmModal
          title={t('modal.adminRequired')}
          description={
            <div>
              <p className="text-sm">{t('modal.adminRequiredDesc')}</p>
            </div>
          }
          confirmText={t('modal.restartAsAdmin')}
          onChange={(open) => {
            if (!open) {
              setShowAdminRequired(false)
            }
          }}
          onConfirm={async () => {
            await restartAsAdmin()
          }}
        />
      )}
      <div style={{ width: `${narrowWidth}px` }} className="side h-full">
        <div className="app-drag flex justify-center items-center z-40 bg-transparent h-[45px]">
          {platform !== 'darwin' && (
            <MihomoIcon className="h-8 leading-8 text-lg mx-px" />
          )}
        </div>
        <div
          className={`${latest ? 'h-[calc(100%-275px)]' : 'h-[calc(100%-185px)]'} overflow-y-auto no-scrollbar`}
        >
          <div className="h-full w-full flex flex-col gap-2">
            {defaultSiderOrder.map((key: string) => {
              const Component = componentMap[key]
              if (!Component) return null
              return <Component key={key} iconOnly={true} />
            })}
          </div>
        </div>
        <div className="p-2 flex flex-col items-center space-y-2">
          {latest && latest.version && <UpdaterButton iconOnly={true} latest={latest} />}
          <OutboundModeSwitcher iconOnly />
          <Button
            size="sm"
            className="app-nodrag"
            isIconOnly
            color={location.pathname.includes('/settings') ? 'primary' : 'default'}
            variant={location.pathname.includes('/settings') ? 'solid' : 'light'}
            onPress={() => navigate('/settings')}
          >
            <IoSettings className="text-[20px]" />
          </Button>
        </div>
      </div>
      <Divider orientation="vertical" />
      <div
        style={{ width: `calc(100% - ${narrowWidth + 1}px)` }}
        className="main grow h-full overflow-y-auto"
      >
        {page}
      </div>
    </div>
  )
}

export default App
