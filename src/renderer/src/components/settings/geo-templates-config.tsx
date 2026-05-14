import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { BaseEditor } from '../base/base-editor'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  getRouteTemplate,
  setRouteTemplate,
  resetRouteTemplate,
  mihomoHotReloadConfig
} from '@renderer/utils/ipc'
import { useTranslation } from 'react-i18next'
import { RotateCcw, Save } from 'lucide-react'

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
  const [activeMode, setActiveMode] = useState('blocked')
  const [templateContent, setTemplateContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

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
  }, [routeModeNames])

  const loadTemplate = useCallback(async (mode: string) => {
    setLoading(true)
    try {
      const content = await getRouteTemplate(mode)
      setTemplateContent(content)
      setOriginalContent(content)
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplate(activeMode)
  }, [activeMode, loadTemplate])

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

  const handleSaveTemplate = async (): Promise<void> => {
    setSaving(true)
    try {
      await setRouteTemplate(activeMode, templateContent)
      setOriginalContent(templateContent)
      await mihomoHotReloadConfig()
      toast.success(t('settings.geoTemplates.templateSaved'))
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setSaving(false)
    }
  }

  const handleResetTemplate = async (): Promise<void> => {
    setSaving(true)
    try {
      await resetRouteTemplate(activeMode)
      await loadTemplate(activeMode)
      await mihomoHotReloadConfig()
      toast.success(t('settings.geoTemplates.templateReset'))
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setSaving(false)
    }
  }

  const isDirty = templateContent !== originalContent

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
        <SettingItem title={t('settings.geoTemplates.routeTemplates')} divider>
          <div className="flex gap-1">
            {ROUTE_MODE_KEYS.map((key) => (
              <Button
                key={key}
                size="sm"
                variant={activeMode === key ? 'default' : 'outline'}
                onClick={() => setActiveMode(key)}
              >
                {modeNameInputs[key] || DEFAULT_MODE_LABELS[key]}
              </Button>
            ))}
          </div>
        </SettingItem>
        <div className="px-4 pb-3">
          <div className="rounded-lg overflow-hidden border border-border" style={{ height: 400 }}>
            {loading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                {t('common.loading')}
              </div>
            ) : (
              <BaseEditor
                value={templateContent}
                language="yaml"
                onChange={(v) => setTemplateContent(v ?? '')}
              />
            )}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleResetTemplate}
              disabled={saving}
            >
              <RotateCcw className="size-3.5 mr-1" />
              {t('settings.geoTemplates.resetTemplate')}
            </Button>
            <Button
              size="sm"
              onClick={handleSaveTemplate}
              disabled={saving || !isDirty}
            >
              <Save className="size-3.5 mr-1" />
              {t('settings.geoTemplates.saveTemplate')}
            </Button>
          </div>
        </div>
      </SettingCard>
    </>
  )
}

export default GeoAndTemplatesConfig
