import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  HomeIcon,
  ProfileIcon,
  ProxiesIcon,
  ConnectionsIcon,
  RulesIcon,
  LogsIcon,
  SettingsIcon,
  CollapsedIcon,
  ExpandedIcon
} from '@renderer/components/icons/sidebar-icons'
import { SlidersHorizontal, ShoppingBag, Stethoscope, ShieldOff } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from '@renderer/components/ui/sidebar'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import UpdaterButton from '@renderer/components/updater/updater-button'
import ConfigViewer from '@renderer/components/sider/config-viewer'
import Logo from '@renderer/assets/velumvpn-logo.svg'
import { SiTelegram } from 'react-icons/si'

interface AppSidebarProps {
  latest?: {
    version: string
    changelog: string
  }
}

const CustomRulesIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <SlidersHorizontal {...(props as React.ComponentProps<typeof SlidersHorizontal>)} />
)
const DiagnosticsIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <Stethoscope {...(props as React.ComponentProps<typeof Stethoscope>)} />
)
const ZapretIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <ShieldOff {...(props as React.ComponentProps<typeof ShieldOff>)} />
)

interface NavItem {
  key: string
  path: string
  icon: React.FC<React.SVGProps<SVGSVGElement>>
  i18nKey: string
  expertOnly?: boolean
  requiresProfile?: boolean
}

interface NavGroup {
  labelKey: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    labelKey: 'sider.groupMain',
    items: [
      { key: 'main', path: '/home', icon: HomeIcon, i18nKey: 'sider.home' },
      { key: 'profile', path: '/profiles', icon: ProfileIcon, i18nKey: 'sider.profileManagement' }
    ]
  },
  {
    labelKey: 'sider.groupVpn',
    items: [
      { key: 'proxy', path: '/proxies', icon: ProxiesIcon, i18nKey: 'sider.proxyGroup', requiresProfile: true },
      { key: 'custom-rules', path: '/custom-rules', icon: CustomRulesIcon, i18nKey: 'sider.myRules', requiresProfile: true }
    ]
  },
  {
    labelKey: 'sider.groupDpi',
    items: [
      { key: 'zapret1', path: '/zapret1', icon: ZapretIcon, i18nKey: 'sider.zapret1' },
      { key: 'zapret2', path: '/zapret2', icon: ZapretIcon, i18nKey: 'sider.zapret2' }
    ]
  },
  {
    labelKey: 'sider.groupTools',
    items: [
      { key: 'diagnostics', path: '/diagnostics', icon: DiagnosticsIcon, i18nKey: 'sider.diagnostics', requiresProfile: true },
      { key: 'connection', path: '/connections', icon: ConnectionsIcon, i18nKey: 'sider.connection', expertOnly: true, requiresProfile: true },
      { key: 'rule', path: '/rules', icon: RulesIcon, i18nKey: 'sider.rules', expertOnly: true, requiresProfile: true },
      { key: 'log', path: '/logs', icon: LogsIcon, i18nKey: 'sider.logs', expertOnly: true }
    ]
  },
  {
    labelKey: 'sider.groupSystem',
    items: [
      { key: 'settings', path: '/settings', icon: SettingsIcon, i18nKey: 'common.settings' }
    ]
  }
]

const AppSidebar: React.FC<AppSidebarProps> = ({ latest }) => {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { toggleSidebar, state } = useSidebar()
  const collapsed = state === 'collapsed'
  const [showRuntimeConfig, setShowRuntimeConfig] = useState(false)
  const { profileConfig } = useProfileConfig()
  const { appConfig } = useAppConfig()
  const expertMode = appConfig?.expertMode ?? false
  const hasProfiles = (profileConfig?.items?.length ?? 0) > 0

  const filterItems = (items: NavItem[]): NavItem[] =>
    items.filter((item) => {
      if (item.expertOnly && !expertMode) return false
      if (item.requiresProfile && !hasProfiles) return false
      return true
    })

  return (
    <Sidebar
      data-guide="app-sidebar"
      collapsible="icon"
      side="left"
      variant="floating"
      className="pt-14.25"
    >
      {/* Logo */}
      <div
        className={`flex items-center gap-2.5 px-3 pb-3 pt-1 border-b border-sidebar-border ${collapsed ? 'justify-center' : ''}`}
      >
        <img src={Logo} alt="VelumVPN" className="size-7 shrink-0" />
        {!collapsed && (
          <span className="text-sm font-bold tracking-wide text-foreground">
            Velum<span style={{ color: 'oklch(0.82 0.16 196)' }}>VPN</span>
          </span>
        )}
      </div>

      <SidebarContent>
        {navGroups.map((group) => {
          const items = filterItems(group.items)
          if (items.length === 0) return null
          return (
            <SidebarGroup key={group.labelKey}>
              <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const Icon = item.icon
                    const isActive = location.pathname.includes(item.path)
                    const label = t(item.i18nKey)
                    return (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton
                          className="cursor-pointer"
                          tooltip={label}
                          isActive={isActive}
                          data-guide={item.key === 'main' ? 'sidebar-home-button' : undefined}
                          onClick={() => navigate(item.path)}
                          onDoubleClick={
                            item.key === 'profile' ? () => setShowRuntimeConfig(true) : undefined
                          }
                        >
                          <Icon className="size-4" />
                          <span>{label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex flex-col items-center gap-1">
          {latest && latest.version && <UpdaterButton iconOnly={collapsed} latest={latest} />}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={t('sider.shop')}
                className="cursor-pointer"
                onClick={() => open('https://shop.velum.ru/')}
              >
                <ShoppingBag className="size-4 shrink-0" style={{ color: 'oklch(0.82 0.16 196)' }} />
                <span>{t('sider.shop')}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={t('sider.support')}
                className="cursor-pointer"
                onClick={() => open('https://t.me/Veluum_support_bot')}
              >
                <SiTelegram className="size-4 shrink-0" style={{ color: '#29b6f6' }} />
                <span>{t('sider.support')}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={t('common.toggleSidebar')}
                onClick={toggleSidebar}
                className="cursor-pointer"
              >
                {collapsed ? (
                  <ExpandedIcon className="size-4 shrink-0" />
                ) : (
                  <CollapsedIcon className="size-4 shrink-0" />
                )}
                <span>{t('common.hideSidebar')}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>

      {showRuntimeConfig && <ConfigViewer onClose={() => setShowRuntimeConfig(false)} />}
    </Sidebar>
  )
}

export default AppSidebar
