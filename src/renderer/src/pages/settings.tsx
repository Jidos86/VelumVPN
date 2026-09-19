import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Github } from 'lucide-react'
import GeneralConfig from '@renderer/components/settings/general-config'
import AdvancedSettings from '@renderer/components/settings/advanced-settings'
import Actions from '@renderer/components/settings/actions'
import ShortcutConfig from '@renderer/components/settings/shortcut-config'
import AppearanceConfig from '@renderer/components/settings/appearance-confis'
import LanguageConfig from '@renderer/components/settings/language-config'
import ProxySwitches from '@renderer/components/settings/proxy-switches'
import GeoAndTemplatesConfig from '@renderer/components/settings/geo-templates-config'
import { IconButton, PageShell, Segmented } from '@renderer/velum/ui/primitives'

type Tab = 'connection' | 'app' | 'advanced'

const Settings: React.FC = () => {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('app')
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
            { key: 'advanced', label: t('velumUi.settings.tabAdvanced') }
          ]}
        />
      </div>

      {/* The existing setting cards keep their logic; only the grouping is new. */}
      <div className="flex flex-col gap-1">
        {tab === 'connection' && (
          <>
            <ProxySwitches />
            <GeoAndTemplatesConfig />
          </>
        )}
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
      </div>
    </PageShell>
  )
}

export default Settings
