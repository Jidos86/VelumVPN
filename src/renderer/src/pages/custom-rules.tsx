import React, { useEffect, useState } from 'react'
import BasePage from '@renderer/components/base/base-page'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { getCustomRules, setCustomRules, restartCore } from '@renderer/utils/ipc'
import { Globe, Monitor, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

const TEAL = 'oklch(0.82 0.16 196)'

const CustomRules: React.FC = () => {
  const [domains, setDomains] = useState<string[]>([])
  const [processes, setProcesses] = useState<string[]>([])
  const [domainInput, setDomainInput] = useState('')
  const [processInput, setProcessInput] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getCustomRules().then((rules) => {
      setDomains(rules.domains)
      setProcesses(rules.processes)
    })
  }, [])

  const save = async (newDomains: string[], newProcesses: string[]) => {
    setSaving(true)
    try {
      await setCustomRules({ domains: newDomains, processes: newProcesses })
      await restartCore()
      toast.success('Правила применены')
    } catch (e) {
      toast.error(String(e))
    } finally {
      setSaving(false)
    }
  }

  const addDomain = () => {
    const val = domainInput.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!val || domains.includes(val)) { setDomainInput(''); return }
    const next = [...domains, val]
    setDomains(next)
    setDomainInput('')
    save(next, processes)
  }

  const removeDomain = (d: string) => {
    const next = domains.filter((x) => x !== d)
    setDomains(next)
    save(next, processes)
  }

  const addProcess = () => {
    const val = processInput.trim()
    if (!val || processes.includes(val)) { setProcessInput(''); return }
    const next = [...processes, val]
    setProcesses(next)
    setProcessInput('')
    save(domains, next)
  }

  const removeProcess = (p: string) => {
    const next = processes.filter((x) => x !== p)
    setProcesses(next)
    save(domains, next)
  }

  return (
    <BasePage title="Мои правила" contentClassName="overflow-y-auto">
      <div className="p-4 flex flex-col gap-6 max-w-xl">

        {/* Domains */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Globe className="size-4" style={{ color: TEAL }} />
            <h2 className="text-sm font-semibold">Сайты через VPN</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Домены, которые всегда идут через VPN (например: <span className="font-mono">thangs.com</span>)
          </p>
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="example.com"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDomain()}
              className="h-8 text-sm font-mono"
            />
            <Button size="sm" onClick={addDomain} disabled={saving} className="h-8 px-3 shrink-0">
              <Plus className="size-3.5" />
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            {domains.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Нет добавленных доменов</p>
            )}
            {domains.map((d) => (
              <div key={d} className="flex items-center justify-between bg-card rounded-md px-3 py-2 border border-border">
                <span className="text-sm font-mono">{d}</span>
                <button
                  onClick={() => removeDomain(d)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  disabled={saving}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-border" />

        {/* Processes */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Monitor className="size-4" style={{ color: TEAL }} />
            <h2 className="text-sm font-semibold">Приложения через VPN</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Имя процесса из диспетчера задач (например: <span className="font-mono">Discord.exe</span>). Требуется TUN-режим.
          </p>
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="App.exe"
              value={processInput}
              onChange={(e) => setProcessInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addProcess()}
              className="h-8 text-sm font-mono"
            />
            <Button size="sm" onClick={addProcess} disabled={saving} className="h-8 px-3 shrink-0">
              <Plus className="size-3.5" />
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            {processes.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Нет добавленных приложений</p>
            )}
            {processes.map((p) => (
              <div key={p} className="flex items-center justify-between bg-card rounded-md px-3 py-2 border border-border">
                <span className="text-sm font-mono">{p}</span>
                <button
                  onClick={() => removeProcess(p)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  disabled={saving}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>

      </div>
    </BasePage>
  )
}

export default CustomRules
