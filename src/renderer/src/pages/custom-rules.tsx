import React, { useEffect, useState } from 'react'
import BasePage from '@renderer/components/base/base-page'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { getCustomRules, setCustomRules, restartCore } from '@renderer/utils/ipc'
import { useConnectionsStore } from '@renderer/store/connections-store'
import { Globe, Monitor, Plus, ShieldOff, Trash2, ListTree } from 'lucide-react'
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
  onInputChange: (v: string) => void
  onAdd: () => void
  onRemove: (item: string) => void
  onPickerOpen?: () => void
  emptyText: string
}

const RuleSection: React.FC<SectionProps> = ({
  icon, title, description, items, input, placeholder, saving, color, showPicker,
  onInputChange, onAdd, onRemove, onPickerOpen, emptyText
}) => (
  <section>
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
      />
      {showPicker && onPickerOpen && (
        <Button size="sm" variant="outline" onClick={onPickerOpen} disabled={saving} className="h-8 px-2 shrink-0" title="Выбрать из активных">
          <ListTree className="size-3.5" />
        </Button>
      )}
      <Button size="sm" onClick={onAdd} disabled={saving} className="h-8 px-3 shrink-0">
        <Plus className="size-3.5" />
      </Button>
    </div>
    <div className="flex flex-col gap-1.5">
      {items.length === 0 && <p className="text-xs text-muted-foreground italic">{emptyText}</p>}
      {items.map((item) => (
        <div key={item} className="flex items-center justify-between bg-card rounded-md px-3 py-2 border border-border">
          <span className="text-sm font-mono">{item}</span>
          <button onClick={() => onRemove(item)} disabled={saving} className="text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  </section>
)

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
        />

      </div>
    </BasePage>
  )
}

export default CustomRules
