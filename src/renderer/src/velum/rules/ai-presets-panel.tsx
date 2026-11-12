import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Globe, LayoutGrid, LayoutList, ListTree, RefreshCcw } from 'lucide-react'
import { GenIcon, type IconBaseProps, type IconType } from 'react-icons'
import {
  SiGithubcopilot,
  SiGooglegemini,
  SiHuggingface,
  SiMeta,
  SiMistralai,
  SiOpenai,
  SiPerplexity,
  SiX
} from 'react-icons/si'
import {
  AiPreset,
  AiPresets,
  getAiPresets,
  refreshAiPresetDomains,
  setAiPreset
} from '@renderer/utils/ipc'
import { applyRulesChange } from '@renderer/velum/rules/apply-rules'
import { useServers } from '@renderer/velum/servers/use-servers'
import { FlagMark, RuleServerList } from '@renderer/velum/servers/rule-server-select'
import { parseServerName } from '@renderer/velum/servers/server-utils'
import {
  GhostButton,
  IconButton,
  Modal,
  PrimaryButton,
  Switch,
  panelClass
} from '@renderer/velum/ui/primitives'

type Layout = 'list' | 'grid'
const LAYOUT_KEY = 'aiPresetLayout'

function ClaudeIcon(props: IconBaseProps): React.JSX.Element {
  return GenIcon({
    tag: 'svg',
    attr: { viewBox: '0 0 24 24' },
    child: [
      {
        tag: 'path',
        attr: {
          d: 'M12 1.5 12.82 8.96 17.25 2.91 14.23 9.77 21.09 6.75 15.04 11.18 22.5 12 15.04 12.82 21.09 17.25 14.23 14.23 17.25 21.09 12.82 15.04 12 22.5 11.18 15.04 6.75 21.09 9.77 14.23 2.91 17.25 8.96 12.82 1.5 12 8.96 11.18 2.91 6.75 9.77 9.77 6.75 2.91 11.18 8.96Z'
        },
        child: []
      }
    ]
  })(props)
}

function DeepSeekIcon(props: IconBaseProps): React.JSX.Element {
  return GenIcon({
    tag: 'svg',
    attr: { viewBox: '0 0 24 24' },
    child: [
      {
        tag: 'path',
        attr: {
          d: 'M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45'
        },
        child: []
      }
    ]
  })(props)
}

function GroqIcon(props: IconBaseProps): React.JSX.Element {
  return GenIcon({
    tag: 'svg',
    attr: { viewBox: '55 30 95 140' },
    child: [
      {
        tag: 'path',
        attr: {
          d: 'm128 49 1.895 1.52C136.336 56.288 140.602 64.49 142 73c.097 1.823.148 3.648.161 5.474l.03 3.247.012 3.482.017 3.613c.01 2.522.016 5.044.02 7.565.01 3.84.041 7.68.072 11.521.007 2.455.012 4.91.016 7.364l.038 3.457c-.033 11.717-3.373 21.83-11.475 30.547-4.552 4.23-9.148 7.372-14.891 9.73l-2.387 1.055c-9.275 3.355-20.3 2.397-29.379-1.13-5.016-2.38-9.156-5.17-13.234-8.925 3.678-4.526 7.41-8.394 12-12l3.063 2.375c5.572 3.958 11.135 5.211 17.937 4.625 6.96-1.384 12.455-4.502 17-10 4.174-6.784 4.59-12.222 4.531-20.094l.012-3.473c.003-2.414-.005-4.827-.022-7.241-.02-3.68 0-7.36.026-11.04-.003-2.353-.008-4.705-.016-7.058l.025-3.312c-.098-7.996-1.732-13.21-6.681-19.47-6.786-5.458-13.105-8.211-21.914-7.792-7.327 1.188-13.278 4.7-17.777 10.601C75.472 72.012 73.86 78.07 75 85c2.191 7.547 5.019 13.948 12 18 5.848 3.061 10.892 3.523 17.438 3.688l2.794.103c2.256.082 4.512.147 6.768.209v16c-16.682.673-29.615.654-42.852-10.848-8.28-8.296-13.338-19.55-13.71-31.277.394-9.87 3.93-17.894 9.562-25.875l1.688-2.563C84.698 35.563 110.05 34.436 128 49Z'
        },
        child: []
      }
    ]
  })(props)
}

type Mark = { Icon: IconType; bg: string; fg?: string; fill?: boolean }

const MARKS: Record<string, Mark> = {
  openai: { Icon: SiOpenai, bg: '#10a37f' },
  anthropic: { Icon: ClaudeIcon, bg: '#d97757', fg: '#f4ece4', fill: true },
  'google-gemini': { Icon: SiGooglegemini, bg: '#1a73e8' },
  xai: { Icon: SiX, bg: '#111111' },
  perplexity: { Icon: SiPerplexity, bg: '#20808d' },
  'github-copilot': { Icon: SiGithubcopilot, bg: '#0b1021' },
  huggingface: { Icon: SiHuggingface, bg: '#ffd21e', fg: '#111111' },
  deepseek: { Icon: DeepSeekIcon, bg: '#4d6bfe' },
  groq: { Icon: GroqIcon, bg: '#f55036' },
  mistral: { Icon: SiMistralai, bg: '#fa520f' },
  'meta-ai': { Icon: SiMeta, bg: '#0668e1' }
}

const PresetMark: React.FC<{ id: string; large?: boolean }> = ({ id, large }) => {
  const mark = MARKS[id]
  const box = large ? 'size-10 text-[13px]' : 'size-8 text-[11px]'
  const glyph = large ? 'size-5' : 'size-4'
  if (!mark) {
    return (
      <span
        className={`flex ${box} shrink-0 items-center justify-center rounded-lg bg-white/8 font-bold tracking-wide text-vl-muted`}
      >
        {id.slice(0, 2).toUpperCase()}
      </span>
    )
  }
  const Icon = mark.Icon
  const iconSize = mark.fill ? (large ? 'size-8' : 'size-6') : glyph
  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center rounded-lg`}
      style={{ background: mark.bg, color: mark.fg ?? '#fff' }}
    >
      <Icon className={iconSize} aria-hidden />
    </span>
  )
}

const readLayout = (): Layout => {
  try {
    return window.localStorage.getItem(LAYOUT_KEY) === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

export const AiPresetsPanel: React.FC = () => {
  const { t } = useTranslation()
  const servers = useServers()
  const [data, setData] = useState<AiPresets>({ presets: [] })
  const [saving, setSaving] = useState(false)
  const [layout, setLayout] = useState<Layout>(readLayout)
  const [editing, setEditing] = useState<AiPreset | null>(null)
  const [editProxy, setEditProxy] = useState('')
  const [viewing, setViewing] = useState<AiPreset | null>(null)

  useEffect(() => {
    getAiPresets().then(setData)
  }, [])

  const changeLayout = (next: Layout): void => {
    setLayout(next)
    try {
      window.localStorage.setItem(LAYOUT_KEY, next)
    } catch {
      // layout just isn't remembered
    }
  }

  const persist = async (next: AiPresets, notice: 'apply' | 'enable' = 'apply'): Promise<void> => {
    setData(next)
    setSaving(true)
    try {
      await applyRulesChange()
      if (notice === 'enable') {
        toast.success(t('customRules.ai.enabledTitle'), { description: t('customRules.ai.enabledHint') })
      } else {
        toast.success(t('customRules.rulesApplied'))
      }
    } catch (err) {
      toast.error(String(err))
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (preset: AiPreset, enabled: boolean): Promise<void> => {
    try {
      await persist(await setAiPreset(preset.id, { enabled }), enabled ? 'enable' : 'apply')
    } catch (err) {
      toast.error(String(err))
    }
  }

  const saveCountry = async (): Promise<void> => {
    if (!editing) return
    try {
      await persist(await setAiPreset(editing.id, { proxy: editProxy }))
      setEditing(null)
    } catch (err) {
      toast.error(String(err))
    }
  }

  const refresh = async (): Promise<void> => {
    setSaving(true)
    try {
      const next = await refreshAiPresetDomains()
      setData(next)
      await applyRulesChange()
      toast.success(t('customRules.ai.updated'))
    } catch (err) {
      toast.error(String(err))
    } finally {
      setSaving(false)
    }
  }

  const openCountry = (preset: AiPreset): void => {
    setEditing(preset)
    setEditProxy(preset.proxy ?? '')
  }

  const countryControl = (preset: AiPreset): React.ReactNode => {
    const pinned = preset.proxy ? parseServerName(preset.proxy) : undefined
    const pinnedEntry = preset.proxy
      ? servers.entries.find((s) => s.name === preset.proxy)
      : undefined
    if (preset.proxy) {
      return (
        <button
          type="button"
          title={t('customRules.serverChoose')}
          disabled={saving}
          onClick={() => openCountry(preset)}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md"
        >
          <FlagMark
            flag={pinnedEntry?.flag ?? pinned?.flag}
            code={pinnedEntry?.code ?? pinned?.code}
            auto={pinnedEntry?.isAuto}
            bare
          />
        </button>
      )
    }
    return (
      <IconButton
        title={t('customRules.serverChoose')}
        aria-label={t('customRules.serverChoose')}
        disabled={saving}
        onClick={() => openCountry(preset)}
      >
        <Globe className="size-3.5" />
      </IconButton>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-xs text-vl-faint">{t('customRules.ai.hint')}</p>
        <div className="flex shrink-0 items-center gap-1">
          <div className="inline-flex gap-0.5 rounded-xl border border-vl-line bg-vl-panel p-0.5">
            <IconButton
              title={t('customRules.ai.layoutList')}
              aria-label={t('customRules.ai.layoutList')}
              className={layout === 'list' ? 'text-vl-text' : ''}
              onClick={() => changeLayout('list')}
            >
              <LayoutList className="size-3.5" />
            </IconButton>
            <IconButton
              title={t('customRules.ai.layoutGrid')}
              aria-label={t('customRules.ai.layoutGrid')}
              className={layout === 'grid' ? 'text-vl-text' : ''}
              onClick={() => changeLayout('grid')}
            >
              <LayoutGrid className="size-3.5" />
            </IconButton>
          </div>
          <PrimaryButton disabled={saving} onClick={() => void refresh()}>
            <RefreshCcw className="size-3.5" />
            {t('customRules.ai.refresh')}
          </PrimaryButton>
        </div>
      </div>
      {data.updatedAt && (
        <span className="-mt-1 text-[11px] text-vl-faint">
          {t('customRules.ai.updatedAt', { time: new Date(data.updatedAt).toLocaleString() })}
        </span>
      )}
      <div
        className={
          layout === 'grid'
            ? 'custom-scrollbar min-h-0 flex-1 overflow-y-auto'
            : `${panelClass} custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2`
        }
      >
        <div className={layout === 'grid' ? 'grid grid-cols-3 gap-2' : ''}>
          {data.presets.map((preset) =>
            layout === 'grid' ? (
              <div key={preset.id} className={`${panelClass} flex flex-col gap-3 p-3`}>
                <div className="flex items-start gap-2.5">
                  <PresetMark id={preset.id} large />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-vl-text">
                      {t(`customRules.ai.presets.${preset.id}`)}
                    </div>
                    <div className="truncate text-[11px] text-vl-muted">
                      {t('customRules.ai.domainCount', { count: preset.domains.length })}
                    </div>
                  </div>
                  <Switch
                    checked={preset.enabled}
                    disabled={saving}
                    label={t(`customRules.ai.presets.${preset.id}`)}
                    onChange={(on) => void toggle(preset, on)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <IconButton
                    title={t('customRules.ai.viewDomains')}
                    aria-label={t('customRules.ai.viewDomains')}
                    disabled={saving}
                    onClick={() => setViewing(preset)}
                  >
                    <ListTree className="size-3.5" />
                  </IconButton>
                  {countryControl(preset)}
                </div>
              </div>
            ) : (
              <div
                key={preset.id}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-white/4"
              >
                <Switch
                  checked={preset.enabled}
                  disabled={saving}
                  label={t(`customRules.ai.presets.${preset.id}`)}
                  onChange={(on) => void toggle(preset, on)}
                />
                <PresetMark id={preset.id} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-vl-text">
                    {t(`customRules.ai.presets.${preset.id}`)}
                  </div>
                  <div className="truncate text-[11px] text-vl-muted">
                    {t('customRules.ai.domainCount', { count: preset.domains.length })}
                  </div>
                </div>
                <IconButton
                  title={t('customRules.ai.viewDomains')}
                  aria-label={t('customRules.ai.viewDomains')}
                  disabled={saving}
                  onClick={() => setViewing(preset)}
                >
                  <ListTree className="size-3.5" />
                </IconButton>
                {countryControl(preset)}
              </div>
            )
          )}
        </div>
      </div>

      {editing && (
        <Modal
          title={t(`customRules.ai.presets.${editing.id}`)}
          onClose={() => setEditing(null)}
          widthClass="max-w-lg"
          footer={
            <>
              <GhostButton onClick={() => setEditing(null)}>{t('customRules.cancel')}</GhostButton>
              <PrimaryButton onClick={() => void saveCountry()}>{t('customRules.save')}</PrimaryButton>
            </>
          }
        >
          <p className="mb-1 text-xs font-semibold text-vl-muted">{t('customRules.serverChoose')}</p>
          <p className="mb-2 text-xs text-vl-faint">{t('customRules.ai.serverHint')}</p>
          <RuleServerList
            value={editProxy}
            entries={servers.entries}
            current={servers.current}
            onChange={setEditProxy}
          />
        </Modal>
      )}

      {viewing && (
        <Modal
          title={t(`customRules.ai.presets.${viewing.id}`)}
          onClose={() => setViewing(null)}
          widthClass="max-w-lg"
          footer={
            <GhostButton onClick={() => setViewing(null)}>{t('customRules.cancel')}</GhostButton>
          }
        >
          <p className="mb-2 text-xs text-vl-faint">{t('customRules.ai.domainsHint')}</p>
          <pre className="custom-scrollbar max-h-72 overflow-auto rounded-xl border border-vl-line bg-vl-tile p-3 font-mono text-xs text-vl-text">
            {viewing.domains.join('\n')}
          </pre>
        </Modal>
      )}
    </div>
  )
}
