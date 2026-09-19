import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSWRConfig } from 'swr'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, CheckSquare, ListTree, Plus, Square, Trash2, Upload, X } from 'lucide-react'
import { CustomRules, getCustomRules, setCustomRules } from '@renderer/utils/ipc'
import { applyRulesChange } from '@renderer/velum/rules/apply-rules'
import { useConnectionsStore } from '@renderer/store/connections-store'
import {
  GhostButton,
  IconButton,
  Modal,
  PageShell,
  PrimaryButton,
  Segmented,
  TextInput,
  panelClass
} from '@renderer/velum/ui/primitives'

type Kind = 'app' | 'domain' | 'ip'
type Side = 'vpn' | 'direct'

const otherSide = (s: Side): Side => (s === 'vpn' ? 'direct' : 'vpn')

// Which CustomRules list backs each tab/column.
const FIELD: Record<Kind, Record<Side, keyof CustomRules>> = {
  app: { vpn: 'processes', direct: 'excludedProcesses' },
  domain: { vpn: 'domains', direct: 'excluded' },
  ip: { vpn: 'ips', direct: 'excludedIPs' }
}

// Section names used in the conflict warnings (existing translations).
const SECTION_KEY: Record<Kind, Record<Side, string>> = {
  app: { vpn: 'customRules.vpnProcesses', direct: 'customRules.directProcesses' },
  domain: { vpn: 'customRules.vpnDomains', direct: 'customRules.directDomains' },
  ip: { vpn: 'customRules.vpnIPs', direct: 'customRules.directIPs' }
}

const PLACEHOLDER: Record<Kind, Record<Side, string>> = {
  app: { vpn: 'App.exe', direct: 'Launcher.exe' },
  domain: { vpn: 'example.com', direct: 'work.example.com' },
  ip: { vpn: '149.154.167.41 / 10.0.0.0/8', direct: '192.168.1.1 / 192.168.0.0/24' }
}

const EMPTY: CustomRules = {
  domains: [],
  processes: [],
  excluded: [],
  excludedProcesses: [],
  ips: [],
  excludedIPs: []
}

const clean = (kind: Kind, val: string): string =>
  kind === 'domain' ? val.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') : val.trim()

const badgeText = (kind: Kind, name: string): string =>
  kind === 'ip' ? 'IP' : (name.trim()[0] ?? '?').toUpperCase()

const ProcessPicker: React.FC<{ onSelect: (name: string) => void; onClose: () => void }> = ({
  onSelect,
  onClose
}) => {
  const { t } = useTranslation()
  const active = useConnectionsStore((s) => s.active)
  const names = useMemo(
    () =>
      [
        ...new Set(
          active
            .map((c) => c.metadata?.process || c.metadata?.processPath?.split(/[\\/]/).pop() || '')
            .filter(Boolean)
        )
      ].sort(),
    [active]
  )
  return (
    <Modal title={t('customRules.activeProcesses')} onClose={onClose} widthClass="max-w-sm">
      {names.length === 0 && (
        <p className="py-6 text-center text-sm text-vl-muted">{t('customRules.noActiveConnections')}</p>
      )}
      <div className="flex flex-col gap-1">
        {names.map((n) => (
          <button
            key={n}
            type="button"
            className="cursor-pointer rounded-lg px-3 py-2 text-left font-mono text-sm text-vl-text transition-colors hover:bg-white/6"
            onClick={() => {
              onSelect(n)
              onClose()
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </Modal>
  )
}

const ImportModal: React.FC<{
  kind: Kind
  onConfirm: (items: string[]) => void
  onClose: () => void
}> = ({ kind, onConfirm, onClose }) => {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])

  const confirm = (): void => {
    const items = [
      ...new Set(
        text
          .split(/[\n,]+/)
          .map((s) => clean(kind, s))
          .filter(Boolean)
      )
    ]
    if (items.length === 0) {
      onClose()
      return
    }
    onConfirm(items)
  }

  return (
    <Modal
      title={t('customRules.importList')}
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>{t('customRules.cancel')}</GhostButton>
          <PrimaryButton onClick={confirm}>{t('customRules.add')}</PrimaryButton>
        </>
      }
    >
      <p className="mb-3 text-xs text-vl-muted">
        {kind === 'domain' ? t('customRules.importHintDomains') : t('customRules.importHintProcesses')}
      </p>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={kind === 'domain' ? 'example.com\nother.com' : kind === 'ip' ? '10.0.0.0/8\n1.2.3.4' : 'App.exe\nLauncher.exe'}
        className="h-40 w-full resize-none rounded-xl border border-vl-line bg-vl-tile px-3 py-2 font-mono text-sm text-vl-text outline-none focus:border-vl-accent/50"
      />
    </Modal>
  )
}

const RulesPage: React.FC = () => {
  const { t } = useTranslation()
  const { mutate } = useSWRConfig()
  const [rules, setRules] = useState<CustomRules>(EMPTY)
  const [kind, setKind] = useState<Kind>('app')
  const [saving, setSaving] = useState(false)
  const [inputs, setInputs] = useState<Record<Side, string>>({ vpn: '', direct: '' })
  const [picker, setPicker] = useState<Side | null>(null)
  const [importSide, setImportSide] = useState<Side | null>(null)
  const [selecting, setSelecting] = useState<Side | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    getCustomRules().then((r) => setRules({ ...EMPTY, ...r }))
  }, [])

  const persist = async (next: CustomRules): Promise<void> => {
    setRules(next)
    setSaving(true)
    try {
      await setCustomRules(next)
      await applyRulesChange()
      mutate('customRulesCount')
      toast.success(t('customRules.rulesApplied'))
    } catch (err) {
      toast.error(String(err))
    } finally {
      setSaving(false)
    }
  }

  const addItems = (side: Side, raw: string[]): void => {
    const own = FIELD[kind][side]
    const opp = FIELD[kind][otherSide(side)]
    const cleaned = [...new Set(raw.map((v) => clean(kind, v)).filter(Boolean))]
    const conflicts = cleaned.filter((x) => rules[opp].includes(x))
    if (conflicts.length > 0) {
      const section = t(SECTION_KEY[kind][otherSide(side)])
      toast.warning(
        cleaned.length === 1
          ? t('customRules.conflictWarning', { item: cleaned[0], section })
          : t('customRules.conflictBulkWarning', { count: conflicts.length, section })
      )
    }
    const fresh = cleaned.filter((x) => !rules[opp].includes(x) && !rules[own].includes(x))
    if (fresh.length === 0) return
    persist({ ...rules, [own]: [...rules[own], ...fresh] })
  }

  const removeItems = (side: Side, items: string[]): void => {
    const own = FIELD[kind][side]
    persist({ ...rules, [own]: rules[own].filter((x) => !items.includes(x)) })
  }

  const moveItem = (side: Side, item: string): void => {
    const own = FIELD[kind][side]
    const opp = FIELD[kind][otherSide(side)]
    persist({
      ...rules,
      [own]: rules[own].filter((x) => x !== item),
      [opp]: [...rules[opp], item]
    })
  }

  const exitSelect = (): void => {
    setSelecting(null)
    setSelected(new Set())
  }

  const submitInput = (side: Side): void => {
    const value = inputs[side]
    setInputs((prev) => ({ ...prev, [side]: '' }))
    if (value.trim()) addItems(side, [value])
  }

  const tabs = [
    { key: 'app' as const, label: t('velumUi.rules.tabApps') },
    { key: 'domain' as const, label: t('velumUi.rules.tabDomains') },
    { key: 'ip' as const, label: t('velumUi.rules.tabIPs') }
  ]

  const renderColumn = (side: Side): React.ReactNode => {
    const items = rules[FIELD[kind][side]]
    const isSelecting = selecting === side
    const allSelected = items.length > 0 && selected.size === items.length
    return (
      <div className={`${panelClass} flex min-w-0 flex-1 flex-col`}>
        <div className="flex items-center justify-between gap-2 border-b border-vl-line px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`size-2 shrink-0 rounded-full ${side === 'vpn' ? 'bg-vl-accent' : 'bg-vl-danger'}`}
            />
            <span className="truncate text-sm font-bold text-vl-text">
              {side === 'vpn' ? t('velumUi.rules.colVpn') : t('velumUi.rules.colDirect')}
            </span>
            <span className="rounded-md bg-white/6 px-1.5 py-px text-[11px] font-semibold text-vl-muted">
              {items.length}
            </span>
          </div>
          <div className="flex items-center">
            {kind === 'app' && (
              <IconButton
                tone="accent"
                title={t('customRules.selectFromActive')}
                disabled={saving || isSelecting}
                onClick={() => setPicker(side)}
              >
                <ListTree className="size-3.5" />
              </IconButton>
            )}
            <IconButton
              tone="accent"
              title={t('customRules.importBulk')}
              disabled={saving || isSelecting}
              onClick={() => setImportSide(side)}
            >
              <Upload className="size-3.5" />
            </IconButton>
            {items.length > 0 && !isSelecting && (
              <IconButton
                tone="accent"
                title={t('customRules.selectToDelete')}
                disabled={saving}
                onClick={() => {
                  setSelecting(side)
                  setSelected(new Set())
                }}
              >
                <CheckSquare className="size-3.5" />
              </IconButton>
            )}
          </div>
        </div>

        <div className="flex gap-2 px-4 pt-3">
          <TextInput
            value={inputs[side]}
            disabled={isSelecting}
            placeholder={PLACEHOLDER[kind][side]}
            onChange={(e) => setInputs((prev) => ({ ...prev, [side]: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && submitInput(side)}
            className="font-mono"
          />
          <PrimaryButton
            aria-label={t('customRules.add')}
            disabled={saving || isSelecting}
            onClick={() => submitInput(side)}
            className="shrink-0 px-3"
          >
            <Plus className="size-4" />
          </PrimaryButton>
        </div>

        {isSelecting && (
          <div className="flex items-center justify-between px-4 pt-3">
            <button
              type="button"
              className="flex cursor-pointer items-center gap-1.5 text-xs text-vl-muted transition-colors hover:text-vl-text"
              onClick={() => setSelected(allSelected ? new Set() : new Set(items))}
            >
              {allSelected ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
              {allSelected ? t('customRules.deselectAll') : t('customRules.selectAll')}
            </button>
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    removeItems(side, [...selected])
                    exitSelect()
                  }}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-vl-danger/15 px-2 py-1 text-xs font-semibold text-vl-danger transition-colors hover:bg-vl-danger/25"
                >
                  <Trash2 className="size-3" />
                  {t('customRules.deleteCount', { count: selected.size })}
                </button>
              )}
              <IconButton onClick={exitSelect}>
                <X className="size-3.5" />
              </IconButton>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5 p-4">
          {items.length === 0 && (
            <div className="py-6 text-center text-sm text-vl-faint">{t('velumUi.rules.empty')}</div>
          )}
          {items.map((item) => {
            const checked = selected.has(item)
            return (
              <div
                key={item}
                onClick={
                  isSelecting
                    ? () =>
                        setSelected((prev) => {
                          const next = new Set(prev)
                          if (next.has(item)) next.delete(item)
                          else next.add(item)
                          return next
                        })
                    : undefined
                }
                className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors ${
                  isSelecting ? 'cursor-pointer select-none' : ''
                } ${checked ? 'border-vl-danger/50 bg-vl-danger/8' : 'border-vl-line bg-vl-tile'}`}
              >
                {isSelecting ? (
                  checked ? (
                    <CheckSquare className="size-4 shrink-0 text-vl-danger" />
                  ) : (
                    <Square className="size-4 shrink-0 text-vl-faint" />
                  )
                ) : (
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/6 text-[11px] font-bold text-vl-muted">
                    {badgeText(kind, item)}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-vl-text">{item}</span>
                {!isSelecting && (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => moveItem(side, item)}
                      title={side === 'vpn' ? t('velumUi.rules.moveToDirect') : t('velumUi.rules.moveToVpn')}
                      aria-label={side === 'vpn' ? t('velumUi.rules.moveToDirect') : t('velumUi.rules.moveToVpn')}
                      className={`flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-vl-line text-vl-muted transition-colors disabled:opacity-50 ${
                        side === 'vpn'
                          ? 'hover:border-vl-danger/50 hover:text-vl-danger'
                          : 'hover:border-vl-accent/50 hover:text-vl-accent'
                      }`}
                    >
                      {/* Icon only, like a transfer list: the arrow points at the column the item moves to
                          (VPN is the left column, bypass is the right one). */}
                      {side === 'vpn' ? <ArrowRight className="size-3.5" /> : <ArrowLeft className="size-3.5" />}
                    </button>
                    <IconButton tone="danger" disabled={saving} onClick={() => removeItems(side, [item])}>
                      <X className="size-3.5" />
                    </IconButton>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <PageShell title={t('customRules.pageTitle')} subtitle={t('velumUi.rules.subtitle')}>
      <div>
        <Segmented
          items={tabs}
          value={kind}
          onChange={(k) => {
            setKind(k)
            exitSelect()
          }}
        />
      </div>
      <div className="flex min-h-0 gap-4">
        {renderColumn('vpn')}
        {renderColumn('direct')}
      </div>

      {picker && (
        <ProcessPicker
          onSelect={(name) => addItems(picker, [name])}
          onClose={() => setPicker(null)}
        />
      )}
      {importSide && (
        <ImportModal
          kind={kind}
          onConfirm={(items) => {
            addItems(importSide, items)
            setImportSide(null)
          }}
          onClose={() => setImportSide(null)}
        />
      )}
    </PageShell>
  )
}

export default RulesPage
