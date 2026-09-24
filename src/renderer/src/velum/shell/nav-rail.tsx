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
import { LifeBuoy } from 'lucide-react'
import { SiTelegram } from 'react-icons/si'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { quitApp } from '@renderer/utils/ipc'
import { platform } from '@renderer/utils/init'
import ConfigViewer from '@renderer/components/sider/config-viewer'
import { DEFAULT_SHOP_URL, DEFAULT_SUPPORT_URL } from './default-links'

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

// Collapsed width matches the rail's old fixed w-14; expanded is wide enough for the longest
// Russian label ("Группы прокси") plus its padding.
const RAIL_COLLAPSED = 56
const RAIL_EXPANDED = 224

// Every row keeps a 56px icon slot regardless of the rail's width, so the icon sits at the exact
// same spot (dead center of the collapsed rail) whether the label next to it is hidden or shown -
// nothing about the collapsed look changes, it only grows a label to the right on hover.
const railRow =
  'relative flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded-lg transition-colors hover:bg-white/6'
const iconSlot = 'relative flex size-14 shrink-0 items-center justify-center'
const rowLabel = 'relative truncate pr-4 text-sm font-medium'

const NavRail: React.FC = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { profileConfig } = useProfileConfig()
  const { appConfig } = useAppConfig()
  const [showRuntimeConfig, setShowRuntimeConfig] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const expertMode = appConfig?.expertMode ?? false
  const hasProfiles = (profileConfig?.items?.length ?? 0) > 0
  const items = navItems
    .filter((item) => expertMode || !expertOnlyItems.has(item.key))
    .filter((item) => hasProfiles || allowedWithoutProfiles.has(item.key))

  const currentProfile = profileConfig?.items?.find((item) => item.id === profileConfig.current)
  const shopUrl = currentProfile?.home || DEFAULT_SHOP_URL
  const supportUrl = currentProfile?.supportUrl || DEFAULT_SUPPORT_URL
  const isTelegramSupport = (() => {
    try {
      return /(^|\.)t\.me$|telegram/i.test(new URL(supportUrl).hostname)
    } catch {
      return /telegram/i.test(supportUrl)
    }
  })()
  // The provider can hide the raw merged-config view (real server addresses) for this profile.
  const configViewAllowed = !currentProfile?.hideSettings

  return (
    <>
      {/* Reserves the collapsed width in the flex layout; the rail itself is an absolutely
          positioned overlay (see the parent's `relative`) so expanding it on hover slides it out
          over the page instead of pushing the page's content sideways. */}
      <div className="w-14 shrink-0" />
      <motion.nav
        data-guide="app-sidebar"
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        initial={false}
        animate={{ width: expanded ? RAIL_EXPANDED : RAIL_COLLAPSED }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        // Higher than a page's own title bar / sticky header (z-40) so the expanded rail is never
        // shown through, but still below modal dialogs (z-50) so those stay on top of everything.
        className="absolute inset-y-0 left-0 z-[45] flex flex-col gap-1 overflow-hidden border-r border-vl-line bg-vl-chrome py-3 shadow-2xl shadow-black/40"
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
              onDoubleClick={
                item.key === 'profile' && configViewAllowed ? () => setShowRuntimeConfig(true) : undefined
              }
              className={`${railRow} ${active ? 'text-vl-accent' : 'text-vl-muted'}`}
            >
              {/* One highlight that glides to the selected item instead of jumping. */}
              {active && (
                <motion.span
                  layoutId="nav-rail-active"
                  aria-hidden
                  layout
                  className="absolute inset-0 rounded-lg bg-vl-accent/14"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className={iconSlot}>
                <Icon className="size-[18px]" strokeWidth={1.6} />
              </span>
              <span className={rowLabel}>{label}</span>
            </button>
          )
        })}

        <div className="flex-1" />

        {platform !== 'darwin' && (
          <button
            type="button"
            title={t('sider.shop')}
            aria-label={t('sider.shop')}
            onClick={() => open(shopUrl)}
            className={`${railRow} text-vl-faint hover:text-vl-text`}
          >
            <span className={iconSlot}>
              <ShoppingBag className="size-[18px]" strokeWidth={1.6} />
            </span>
            <span className={rowLabel}>{t('sider.shop')}</span>
          </button>
        )}
        <button
          type="button"
          title={t('sider.support')}
          aria-label={t('sider.support')}
          onClick={() => open(supportUrl)}
          className={`${railRow} text-vl-faint hover:text-vl-text`}
        >
          <span className={iconSlot}>
            {isTelegramSupport ? (
              <SiTelegram className="size-[17px]" />
            ) : (
              <LifeBuoy className="size-[18px]" strokeWidth={1.6} />
            )}
          </span>
          <span className={rowLabel}>{t('sider.support')}</span>
        </button>
        <button
          type="button"
          title={t('velumUi.nav.quit')}
          aria-label={t('velumUi.nav.quit')}
          onClick={() => quitApp()}
          className={`${railRow} text-vl-faint hover:text-vl-danger`}
        >
          <span className={iconSlot}>
            <Power className="size-[18px]" strokeWidth={1.6} />
          </span>
          <span className={rowLabel}>{t('velumUi.nav.quit')}</span>
        </button>

        {showRuntimeConfig && configViewAllowed && (
          <ConfigViewer onClose={() => setShowRuntimeConfig(false)} />
        )}
      </motion.nav>
    </>
  )
}

export default NavRail
