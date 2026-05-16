import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  openRouteTemplateFile,
  resetRouteTemplate,
  mihomoHotReloadConfig
} from '@renderer/utils/ipc'
import { useTranslation } from 'react-i18next'
import { ExternalLink, RotateCcw } from 'lucide-react'

const DEFAULT_MODE_LABELS: Record<string, string> = {
  blocked: 'Только заблокированные',
  'all-except-ru': 'Все зарубежные',
  all: 'Всё через VPN'
}

const ROUTE_MODE_KEYS = ['blocked', 'all-except-ru', 'all'] as const

const GeoAndTemplatesConfig: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig, patchAppConfig } = useAppConfig()
  const { geositeUrl = '', geoipUrl = '', routeModeNames = {} } = appConfig || {}

  const [geositeInput, setGeositeInput] = useState(geositeUrl)
  const [geoipInput, setGeoipInput] = useState(geoipUrl)
  const [modeNameInputs, setModeNameInputs] = useState<Record<string, string>>({
    blocked: routeModeNames?.blocked ?? '',
    'all-except-ru': routeModeNames?.['all-except-ru'] ?? '',
    all: routeModeNames?.all ?? ''
  })

  useEffect(() => {
    setGeositeInput(geositeUrl)
    setGeoipInput(geoipUrl)
  }, [geositeUrl, geoipUrl])

  useEffect(() => {
    setModeNameInputs({
      blocked: routeModeNames?.blocked ?? '',
      'all-except-ru': routeModeNames?.['all-except-ru'] ?? '',
      all: routeModeNames?.all ?? ''
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeModeNames?.blocked, routeModeNames?.['all-except-ru'], routeModeNames?.all])

  const handleSaveGeoUrls = async (): Promise<void> => {
    await patchAppConfig({ geositeUrl: geositeInput.trim(), geoipUrl: geoipInput.trim() })
    toast.success(t('settings.geoTemplates.geoUrlsSaved'))
  }

  const handleSaveModeNames = async (): Promise<void> => {
    const names: Record<string, string | undefined> = {}
    for (const key of ROUTE_MODE_KEYS) {
      const v = modeNameInputs[key].trim()
      names[key] = v || undefined
    }
    await patchAppConfig({ routeModeNames: names as AppConfig['routeModeNames'] })
    toast.success(t('settings.geoTemplates.modeNamesSaved'))
  }

  const handleOpenTemplate = async (mode: string): Promise<void> => {
    try {
      await openRouteTemplateFile(mode)
    } catch (e) {
      toast.error(`${e}`)
    }
  }

  const handleResetTemplate = async (mode: string): Promise<void> => {
    try {
      await resetRouteTemplate(mode)
      await mihomoHotReloadConfig()
      toast.success(t('settings.geoTemplates.templateReset'))
    } catch (e) {
      toast.error(`${e}`)
    }
  }

  return (
    <>
      {/* Geodata URLs */}
      <SettingCard>
        <SettingItem title={t('settings.geoTemplates.geositeUrl')} divider>
          <div className="flex gap-2 w-full max-w-md">
            <Input
              value={geositeInput}
              onChange={(e) => setGeositeInput(e.target.value)}
              placeholder={t('settings.geoTemplates.geoUrlPlaceholder')}
              className="flex-1 text-xs"
            />
          </div>
        </SettingItem>
        <SettingItem title={t('settings.geoTemplates.geoipUrl')} divider>
          <div className="flex gap-2 w-full max-w-md">
            <Input
              value={geoipInput}
              onChange={(e) => setGeoipInput(e.target.value)}
              placeholder={t('settings.geoTemplates.geoUrlPlaceholder')}
              className="flex-1 text-xs"
            />
          </div>
        </SettingItem>
        <SettingItem title="">
          <Button size="sm" onClick={handleSaveGeoUrls}>
            {t('settings.geoTemplates.saveUrls')}
          </Button>
        </SettingItem>
      </SettingCard>

      {/* Mode names */}
      <SettingCard>
        {ROUTE_MODE_KEYS.map((key, i) => (
          <SettingItem key={key} title={t('settings.geoTemplates.modeName', { default: DEFAULT_MODE_LABELS[key] })} divider={i < ROUTE_MODE_KEYS.length - 1}>
            <Input
              value={modeNameInputs[key]}
              onChange={(e) => setModeNameInputs((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder={DEFAULT_MODE_LABELS[key]}
              className="w-48 text-xs"
            />
          </SettingItem>
        ))}
        <SettingItem title="">
          <Button size="sm" onClick={handleSaveModeNames}>
            {t('settings.geoTemplates.saveModeNames')}
          </Button>
        </SettingItem>
      </SettingCard>

      {/* Routing templates */}
      <SettingCard>
        {ROUTE_MODE_KEYS.map((key, i) => (
          <SettingItem
            key={key}
            title={modeNameInputs[key] || DEFAULT_MODE_LABELS[key]}
            divider={i < ROUTE_MODE_KEYS.length - 1}
          >
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleOpenTemplate(key)}>
                <ExternalLink className="size-3.5 mr-1" />
                {t('settings.geoTemplates.openInEditor')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleResetTemplate(key)}>
                <RotateCcw className="size-3.5 mr-1" />
                {t('settings.geoTemplates.resetTemplate')}
              </Button>
            </div>
          </SettingItem>
        ))}
      </SettingCard>
    </>
  )
}

export default GeoAndTemplatesConfig
