import React, { useEffect, useRef, useState } from 'react'
import BasePage from '@renderer/components/base/base-page'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { getCustomRules, setCustomRules, restartCore } from '@renderer/utils/ipc'
import { useConnectionsStore } from '@renderer/store/connections-store'
import { Globe, Monitor, Plus, ShieldOff, Trash2, ListTree, Upload, CheckSquare, Square, X } from 'lucide-react'
import { toast } from 'sonner'

const TEAL = 'oklch(0.82 0.16 196)'
const RED = 'oklch(0.65 0.2 25)'

interface ProcessPickerProps {
  onSelect: (name: string) => void
  onClose: () => void
}

const ProcessPicker: React.FC<ProcessPickerProps> = ({ onSelect, onClose }) => {
  const active = useConnectionsStore((s) => s.active)
  const names = [...new Set(
    active
      .map((c) => c.metadata?.process || c.metadata?.processPath?.split(/[\\/]/).pop() || '')
      .filter(Boolean)
  )].sort()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-72 max-h-80 flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-3 py-2 border-b border-border text-sm font-medium">Активные процессы</div>
        <div className="overflow-y-auto flex-1">
          {names.length === 0 && (
            <p className="text-xs text-muted-foreground italic p-3">Нет активных подключений</p>
          )}
          {names.map((n) => (
            <button
              key={n}
              className="w-full text-left px-3 py-2 text-sm font-mono hover:bg-accent transition-colors"
              onClick={() => { onSelect(n); onClose() }}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="px-3 py-2 border-t border-border">
          <Button size="sm" variant="ghost" className="w-full h-7 text-xs" onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    </div>
  )
}

interface ImportModalProps {
  isDomain: boolean
  onConfirm: (items: string[]) => void
  onClose: () => void
}

const ImportModal: React.FC<ImportModalProps> = ({ isDomain, onConfirm, onClose }) => {
  const [text, setText] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { taRef.current?.focus() }, [])

  const handleConfirm = () => {
    const raw = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
    const parsed = isDomain
      ? raw.map((s) => s.replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
      : raw
    const unique = [...new Set(parsed.filter(Boolean))]
    if (unique.length === 0) { onClose(); return }
    onConfirm(unique)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-96 flex flex-col gap-3 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-medium">Импорт списка</div>
        <p className="text-xs text-muted-foreground">Вставьте {isDomain ? 'домены' : 'имена процессов'} — каждый с новой строки или через запятую.</p>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isDomain ? 'example.com\nother.com' : 'App.exe\nLauncher.exe'}
          className="w-full h-40 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={onClose}>Отмена</Button>
          <Button size="sm" onClick={handleConfirm}>Добавить</Button>
        </div>
      </div>
    </div>
  )
}

interface SectionProps {
  icon: React.ReactNode
  title: string
  description: React.ReactNode
  items: string[]
  input: string
  placeholder: string
  saving: boolean
  color?: string
  showPicker?: boolean
  isDomain?: boolean
  onInputChange: (v: string) => void
  onAdd: () => void
  onRemove: (item: string) => void
  onPickerOpen?: () => void
  onBulkImport: (newItems: string[]) => void
  onBulkRemove: (items: string[]) => void
  emptyText: string
}

const RuleSection: React.FC<SectionProps> = ({
  icon, title, description, items, input, placeholder, saving, color, showPicker, isDomain,
  onInputChange, onAdd, onRemove, onPickerOpen, onBulkImport, onBulkRemove, emptyText
}) => {
  const [showImport, setShowImport] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggleSelect = (item: string) =>
    setSelected((prev) => { const s = new Set(prev); s.has(item) ? s.delete(item) : s.add(item); return s })

  const allSelected = items.length > 0 && selected.size === items.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items))

  const exitSelect = () => { setSelecting(false); setSelected(new Set()) }

  const deleteSelected = () => {
    onBulkRemove([...selected])
    exitSelect()
  }

  return (
  <section>
    {showImport && (
      <ImportModal
        isDomain={!!isDomain}
        onConfirm={(newItems) => { onBulkImport(newItems); setShowImport(false) }}
        onClose={() => setShowImport(false)}
      />
    )}
    <div className="flex items-center gap-2 mb-3">
      <span style={{ color }}>{icon}</span>
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
    <p className="text-xs text-muted-foreground mb-3">{description}</p>
    <div className="flex gap-2 mb-3">
      <Input
        placeholder={placeholder}
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onAdd()}
        className="h-8 text-sm font-mono"
        disabled={selecting}
      />
      {showPicker && onPickerOpen && (
        <Button size="sm" variant="outline" onClick={onPickerOpen} disabled={saving || selecting} className="h-8 px-2 shrink-0" title="Выбрать из активных">
          <ListTree className="size-3.5" />
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => setShowImport(true)} disabled={saving || selecting} className="h-8 px-2 shrink-0" title="Импортировать список">
        <Upload className="size-3.5" />
      </Button>
      {items.length > 0 && !selecting && (
        <Button size="sm" variant="outline" onClick={() => setSelecting(true)} disabled={saving} className="h-8 px-2 shrink-0" title="Выбрать для удаления">
          <CheckSquare className="size-3.5" />
        </Button>
      )}
      <Button size="sm" onClick={onAdd} disabled={saving || selecting} className="h-8 px-3 shrink-0">
        <Plus className="size-3.5" />
      </Button>
    </div>

    {selecting && (
      <div className="flex items-center justify-between mb-2 px-1">
        <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={toggleAll}>
          {allSelected ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
          {allSelected ? 'Снять всё' : 'Выбрать всё'}
        </button>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button size="sm" variant="destructive" onClick={deleteSelected} disabled={saving} className="h-6 px-2 text-xs">
              <Trash2 className="size-3 mr-1" />
              Удалить ({selected.size})
            </Button>
          )}
          <button onClick={exitSelect} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    )}

    <div className="flex flex-col gap-1.5">
      {items.length === 0 && <p className="text-xs text-muted-foreground italic">{emptyText}</p>}
      {items.map((item) => (
        <div
          key={item}
          className={`flex items-center justify-between bg-card rounded-md px-3 py-2 border transition-colors ${selecting ? 'cursor-pointer select-none' : ''} ${selected.has(item) ? 'border-destructive/60 bg-destructive/5' : 'border-border'}`}
          onClick={selecting ? () => toggleSelect(item) : undefined}
        >
          {selecting && (
            <span className="mr-2 text-muted-foreground shrink-0">
              {selected.has(item) ? <CheckSquare className="size-3.5 text-destructive" /> : <Square className="size-3.5" />}
            </span>
          )}
          <span className="text-sm font-mono flex-1">{item}</span>
          {!selecting && (
            <button onClick={() => onRemove(item)} disabled={saving} className="text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  </section>
  )
}

const CustomRules: React.FC = () => {
  const [domains, setDomains] = useState<string[]>([])
  const [processes, setProcesses] = useState<string[]>([])
  const [excluded, setExcluded] = useState<string[]>([])
  const [excludedProcesses, setExcludedProcesses] = useState<string[]>([])
  const [domainInput, setDomainInput] = useState('')
  const [processInput, setProcessInput] = useState('')
  const [excludedInput, setExcludedInput] = useState('')
  const [excludedProcInput, setExcludedProcInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [picker, setPicker] = useState<'vpn' | 'direct' | null>(null)

  useEffect(() => {
    getCustomRules().then((rules) => {
      setDomains(rules.domains ?? [])
      setProcesses(rules.processes ?? [])
      setExcluded(rules.excluded ?? [])
      setExcludedProcesses(rules.excludedProcesses ?? [])
    })
  }, [])

  const save = async (d: string[], p: string[], e: string[], ep: string[]) => {
    setSaving(true)
    try {
      await setCustomRules({ domains: d, processes: p, excluded: e, excludedProcesses: ep })
      await restartCore()
      toast.success('Правила применены')
    } catch (err) {
      toast.error(String(err))
    } finally {
      setSaving(false)
    }
  }

  const clean = (val: string, isDomain: boolean) =>
    isDomain ? val.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') : val.trim()

  return (
    <BasePage title="Мои правила" contentClassName="overflow-y-auto">
      {picker && (
        <ProcessPicker
          onSelect={(name) => {
            if (picker === 'vpn') {
              if (processes.includes(name)) return
              const next = [...processes, name]
              setProcesses(next)
              save(domains, next, excluded, excludedProcesses)
            } else {
              if (excludedProcesses.includes(name)) return
              const next = [...excludedProcesses, name]
              setExcludedProcesses(next)
              save(domains, processes, excluded, next)
            }
          }}
          onClose={() => setPicker(null)}
        />
      )}

      <div className="p-4 flex flex-col gap-6 max-w-xl">

        {/* Домены через VPN */}
        <RuleSection
          icon={<Globe className="size-4" />}
          title="Сайты через VPN"
          color={TEAL}
          description={<>Домены, которые всегда идут через VPN (например: <span className="font-mono">thangs.com</span>)</>}
          items={domains}
          input={domainInput}
          placeholder="example.com"
          saving={saving}
          isDomain
          emptyText="Нет добавленных доменов"
          onInputChange={setDomainInput}
          onAdd={() => {
            const val = clean(domainInput, true)
            if (!val || domains.includes(val)) { setDomainInput(''); return }
            const next = [...domains, val]; setDomains(next); setDomainInput('')
            save(next, processes, excluded, excludedProcesses)
          }}
          onRemove={(d) => {
            const next = domains.filter((x) => x !== d); setDomains(next)
            save(next, processes, excluded, excludedProcesses)
          }}
          onBulkImport={(newItems) => {
            const next = [...new Set([...domains, ...newItems])]
            setDomains(next)
            save(next, processes, excluded, excludedProcesses)
          }}
          onBulkRemove={(toRemove) => {
            const next = domains.filter((x) => !toRemove.includes(x))
            setDomains(next)
            save(next, processes, excluded, excludedProcesses)
          }}
        />

        {/* Приложения через VPN */}
        <RuleSection
          icon={<Monitor className="size-4" />}
          title="Приложения через VPN"
          color={TEAL}
          description={<>Имя процесса (например: <span className="font-mono">Discord.exe</span>). Требуется TUN-режим.</>}
          items={processes}
          input={processInput}
          placeholder="App.exe"
          saving={saving}
          showPicker
          emptyText="Нет добавленных приложений"
          onInputChange={setProcessInput}
          onAdd={() => {
            const val = clean(processInput, false)
            if (!val || processes.includes(val)) { setProcessInput(''); return }
            const next = [...processes, val]; setProcesses(next); setProcessInput('')
            save(domains, next, excluded, excludedProcesses)
          }}
          onRemove={(p) => {
            const next = processes.filter((x) => x !== p); setProcesses(next)
            save(domains, next, excluded, excludedProcesses)
          }}
          onPickerOpen={() => setPicker('vpn')}
          onBulkImport={(newItems) => {
            const next = [...new Set([...processes, ...newItems])]
            setProcesses(next)
            save(domains, next, excluded, excludedProcesses)
          }}
          onBulkRemove={(toRemove) => {
            const next = processes.filter((x) => !toRemove.includes(x))
            setProcesses(next)
            save(domains, next, excluded, excludedProcesses)
          }}
        />

        <div className="border-t border-border" />

        {/* Домены в обход VPN */}
        <RuleSection
          icon={<ShieldOff className="size-4" />}
          title="Сайты в обход VPN"
          color={RED}
          description={<>Домены, которые всегда идут напрямую, минуя VPN (например: <span className="font-mono">work.example.com</span>)</>}
          items={excluded}
          input={excludedInput}
          placeholder="work.example.com"
          saving={saving}
          isDomain
          emptyText="Нет исключённых доменов"
          onInputChange={setExcludedInput}
          onAdd={() => {
            const val = clean(excludedInput, true)
            if (!val || excluded.includes(val)) { setExcludedInput(''); return }
            const next = [...excluded, val]; setExcluded(next); setExcludedInput('')
            save(domains, processes, next, excludedProcesses)
          }}
          onRemove={(d) => {
            const next = excluded.filter((x) => x !== d); setExcluded(next)
            save(domains, processes, next, excludedProcesses)
          }}
          onBulkImport={(newItems) => {
            const next = [...new Set([...excluded, ...newItems])]
            setExcluded(next)
            save(domains, processes, next, excludedProcesses)
          }}
          onBulkRemove={(toRemove) => {
            const next = excluded.filter((x) => !toRemove.includes(x))
            setExcluded(next)
            save(domains, processes, next, excludedProcesses)
          }}
        />

        {/* Приложения в обход VPN */}
        <RuleSection
          icon={<Monitor className="size-4" />}
          title="Приложения в обход VPN"
          color={RED}
          description={<>Имя процесса (например: <span className="font-mono">EpicGamesLauncher.exe</span>). Требуется TUN-режим.</>}
          items={excludedProcesses}
          input={excludedProcInput}
          placeholder="Launcher.exe"
          saving={saving}
          showPicker
          emptyText="Нет исключённых приложений"
          onInputChange={setExcludedProcInput}
          onAdd={() => {
            const val = clean(excludedProcInput, false)
            if (!val || excludedProcesses.includes(val)) { setExcludedProcInput(''); return }
            const next = [...excludedProcesses, val]; setExcludedProcesses(next); setExcludedProcInput('')
            save(domains, processes, excluded, next)
          }}
          onRemove={(p) => {
            const next = excludedProcesses.filter((x) => x !== p); setExcludedProcesses(next)
            save(domains, processes, excluded, next)
          }}
          onPickerOpen={() => setPicker('direct')}
          onBulkImport={(newItems) => {
            const next = [...new Set([...excludedProcesses, ...newItems])]
            setExcludedProcesses(next)
            save(domains, processes, excluded, next)
          }}
          onBulkRemove={(toRemove) => {
            const next = excludedProcesses.filter((x) => !toRemove.includes(x))
            setExcludedProcesses(next)
            save(domains, processes, excluded, next)
          }}
        />

      </div>
    </BasePage>
  )
}

export default CustomRules
