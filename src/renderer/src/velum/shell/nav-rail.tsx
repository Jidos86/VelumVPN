import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowLeftRight,
  Globe,
  House,
  ListChecks,
  Power,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  WalletCards
} from 'lucide-react'
import { SiTelegram } from 'react-icons/si'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { quitApp } from '@renderer/utils/ipc'
import { platform } from '@renderer/utils/init'
import ConfigViewer from '@renderer/components/sider/config-viewer'

const navItems = [
  { key: 'main', path: '/home', icon: House, i18nKey: 'sider.home' },
  { key: 'profile', path: '/profiles', icon: WalletCards, i18nKey: 'sider.profileManagement' },
  { key: 'proxy', path: '/proxies', icon: Globe, i18nKey: 'sider.proxyGroup' },
  { key: 'custom-rules', path: '/custom-rules', icon: ShieldCheck, i18nKey: 'sider.myRules' },
  { key: 'connection', path: '/connections', icon: ArrowLeftRight, i18nKey: 'sider.connection' },
  { key: 'diagnostics', path: '/diagnostics', icon: Activity, i18nKey: 'sider.diagnostics' },
  { key: 'rule', path: '/rules', icon: ListChecks, i18nKey: 'sider.rules' },
  { key: 'log', path: '/logs', icon: ScrollText, i18nKey: 'sider.logs' },
  { key: 'settings', path: '/settings', icon: Settings, i18nKey: 'common.settings' }
]

const allowedWithoutProfiles = new Set(['main', 'profile', 'settings', 'custom-rules'])
const expertOnlyItems = new Set(['proxy', 'connection', 'diagnostics', 'rule', 'log'])

const railButton =
  'flex size-9 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-white/6'

const NavRail: React.FC = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { profileConfig } = useProfileConfig()
  const { appConfig } = useAppConfig()
  const [showRuntimeConfig, setShowRuntimeConfig] = useState(false)
  const expertMode = appConfig?.expertMode ?? false
  const hasProfiles = (profileConfig?.items?.length ?? 0) > 0
  const items = navItems
    .filter((item) => expertMode || !expertOnlyItems.has(item.key))
    .filter((item) => hasProfiles || allowedWithoutProfiles.has(item.key))

  return (
    <nav
      data-guide="app-sidebar"
      className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-vl-line bg-vl-chrome py-3"
    >
      {items.map((item) => {
        const Icon = item.icon
        const active = location.pathname.includes(item.path)
        const label = t(item.i18nKey)
        return (
          <button
            key={item.key}
            type="button"
            title={label}
            aria-label={label}
            data-guide={item.key === 'main' ? 'sidebar-home-button' : undefined}
            onClick={() => navigate(item.path)}
            onDoubleClick={item.key === 'profile' ? () => setShowRuntimeConfig(true) : undefined}
            className={`${railButton} relative ${active ? 'text-vl-accent' : 'text-vl-muted'}`}
          >
            {/* One highlight that glides to the selected item instead of jumping. */}
            {active && (
              <motion.span
                layoutId="nav-rail-active"
                aria-hidden
                className="absolute inset-0 rounded-lg bg-vl-accent/14"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <Icon className="relative size-[18px]" strokeWidth={1.6} />
          </button>
        )
      })}

      <div className="flex-1" />

      {platform !== 'darwin' && (
        <button
          type="button"
          title={t('sider.shop')}
          aria-label={t('sider.shop')}
          onClick={() => open('https://shop.velum.uno/')}
          className={`${railButton} text-vl-faint hover:text-vl-text`}
        >
          <ShoppingBag className="size-[18px]" strokeWidth={1.6} />
        </button>
      )}
      <button
        type="button"
        title={t('sider.support')}
        aria-label={t('sider.support')}
        onClick={() => open('https://t.me/Veluum_support_bot')}
        className={`${railButton} text-vl-faint hover:text-vl-text`}
      >
        <SiTelegram className="size-[17px]" />
      </button>
      <button
        type="button"
        title={t('velumUi.nav.quit')}
        aria-label={t('velumUi.nav.quit')}
        onClick={() => quitApp()}
        className={`${railButton} text-vl-faint hover:text-vl-danger`}
      >
        <Power className="size-[18px]" strokeWidth={1.6} />
      </button>

      {showRuntimeConfig && <ConfigViewer onClose={() => setShowRuntimeConfig(false)} />}
    </nav>
  )
}

export default NavRail
