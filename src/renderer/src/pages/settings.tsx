import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { Github } from 'lucide-react'
import GeneralConfig from '@renderer/components/settings/general-config'
import AdvancedSettings from '@renderer/components/settings/advanced-settings'
import Actions from '@renderer/components/settings/actions'
import ShortcutConfig from '@renderer/components/settings/shortcut-config'
import AppearanceConfig from '@renderer/components/settings/appearance-confis'
import LanguageConfig from '@renderer/components/settings/language-config'
import ProxySwitches from '@renderer/components/settings/proxy-switches'
import GeoAndTemplatesConfig from '@renderer/components/settings/geo-templates-config'
import TunHealthPanel from '@renderer/components/settings/tun-health'
import { IconButton, PageShell, Segmented } from '@renderer/velum/ui/primitives'

type Tab = 'connection' | 'app' | 'diagnostics' | 'advanced'

const Settings: React.FC = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const requestedTab = (location.state as { tab?: Tab } | null)?.tab
  const [tab, setTab] = useState<Tab>(
    requestedTab === 'diagnostics' ||
      requestedTab === 'connection' ||
      requestedTab === 'advanced' ||
      requestedTab === 'app'
      ? requestedTab
      : 'app'
  )
  const [showHiddenSettings, setShowHiddenSettings] = useState(false)

  return (
    <PageShell
      title={t('pages.settings.title')}
      actions={
        <IconButton
          title={t('pages.settings.githubRepo')}
          onClick={() => {
            window.open('https://github.com/Jidos86/VelumVPN')
          }}
        >
          <Github className="size-4" />
        </IconButton>
      }
    >
      <div>
        <Segmented
          value={tab}
          onChange={setTab}
          items={[
            { key: 'app', label: t('velumUi.settings.tabApp') },
            { key: 'connection', label: t('velumUi.settings.tabConnection') },
            { key: 'diagnostics', label: t('velumUi.settings.tabDiagnostics') },
            { key: 'advanced', label: t('velumUi.settings.tabAdvanced') }
          ]}
        />
      </div>

      {/* The existing setting cards keep their logic; only the grouping is new. A quick fade
          instead of an instant swap when the tab changes, to match the rest of the app. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          className="flex flex-col gap-1"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.1, ease: 'easeIn' } }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          {tab === 'connection' && (
            <>
              <ProxySwitches />
              <GeoAndTemplatesConfig />
            </>
          )}
          {tab === 'diagnostics' && <TunHealthPanel />}
          {tab === 'app' && (
            <>
              <LanguageConfig />
              <GeneralConfig showHiddenSettings={showHiddenSettings} />
              <AppearanceConfig showHiddenSettings={showHiddenSettings} />
            </>
          )}
          {tab === 'advanced' && (
            <>
              <AdvancedSettings showHiddenSettings={showHiddenSettings} />
              <ShortcutConfig />
              <Actions
                showHiddenSettings={showHiddenSettings}
                onUnlockHiddenSettings={() => setShowHiddenSettings(true)}
              />
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </PageShell>
  )
}

export default Settings
