import React, { useMemo, useState } from 'react'
import BasePage from '@renderer/components/base/base-page'
import { useConnectionsStore } from '@renderer/store/connections-store'
import { useLogsStore } from '@renderer/store/logs-store'
import { getCustomRules, setCustomRules, restartCore } from '@renderer/utils/ipc'
import { Button } from '@renderer/components/ui/button'
import { ArrowRight, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

const ERROR_KEYWORDS = ['timeout', 'refused', 'no such host', 'eof', 'reset by peer', 'dial', 'failed', 'error']
const TEAL = 'oklch(0.82 0.16 196)'
const RED = 'oklch(0.65 0.2 25)'

type Filter = 'all' | 'errors' | 'direct' | 'vpn'

function isError(payload: string): boolean {
  const lower = payload.toLowerCase()
  return ERROR_KEYWORDS.some((k) => lower.includes(k))
}

function extractDomainFromLog(payload: string): string | null {
  const m = payload.match(/-->?\s+([a-zA-Z0-9._-]+\.[a-zA-Z]{2,})(?::\d+)?/)
  return m ? m[1] : null
}

const Diagnostics: React.FC = () => {
  const closed = useConnectionsStore((s) => s.closed)
  const clearAllClosed = useConnectionsStore((s) => s.clearAllClosed)
  const logs = useLogsStore((s) => s.logs)
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState<string | null>(null)

  const errorDomains = useMemo(() => {
    const set = new Set<string>()
    logs.forEach((log) => {
      if (isError(log.payload)) {
        const domain = extractDomainFromLog(log.payload)
        if (domain) set.add(domain)
      }
    })
    return set
  }, [logs])

  const rows = useMemo(() => {
    return closed.map((conn) => {
      const process = conn.metadata.process || conn.metadata.processPath?.split(/[\\/]/).pop() || '—'
      const host = conn.metadata.host || conn.metadata.sniffHost || conn.metadata.destinationIP || '—'
      const isVpn = conn.chains.some((c) => c !== 'DIRECT' && c !== 'REJECT')
      const isDirect = conn.chains.includes('DIRECT')
      const isReject = conn.chains.includes('REJECT')
      const hasError = errorDomains.has(host)
      return { conn, process, host, isVpn, isDirect, isReject, hasError }
    }).reverse()
  }, [closed, errorDomains])

  const filtered = useMemo(() => {
    switch (filter) {
      case 'errors': return rows.filter((r) => r.hasError)
      case 'direct': return rows.filter((r) => r.isDirect)
      case 'vpn': return rows.filter((r) => r.isVpn)
      default: return rows
    }
  }, [rows, filter])

  const addToVpn = async (host: string) => {
    if (!host || host === '—') return
    const domain = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    setAdding(domain)
    try {
      const rules = await getCustomRules()
      if (rules.domains.includes(domain)) {
        toast.info(`${domain} уже в правилах`)
        return
      }
      await setCustomRules({ ...rules, domains: [...rules.domains, domain] })
      await restartCore()
      toast.success(`${domain} добавлен в VPN`)
    } catch (e) {
      toast.error(String(e))
    } finally {
      setAdding(null)
    }
  }

  const tabs: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'errors', label: 'Ошибки' },
    { key: 'direct', label: 'Напрямую' },
    { key: 'vpn', label: 'VPN' },
  ]

  return (
    <BasePage
      title="Диагностика"
      contentClassName="overflow-y-auto"
      header={
        <Button size="sm" variant="ghost" onClick={clearAllClosed} className="h-7 px-2 text-xs text-muted-foreground">
          <Trash2 className="size-3.5 mr-1" />
          Очистить
        </Button>
      }
    >
      <div className="p-4 flex flex-col gap-3">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === tab.key
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.key === 'errors' && errorDomains.size > 0 && (
                <span className="ml-1 text-destructive">({errorDomains.size})</span>
              )}
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground italic py-4 text-center">Нет данных</p>
        )}

        <div className="flex flex-col gap-1.5">
          {filtered.map(({ conn, process, host, isVpn, isDirect, isReject, hasError }) => (
            <div
              key={conn.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-md border text-sm ${
                hasError
                  ? 'border-destructive/40 bg-destructive/5'
                  : 'border-border bg-card'
              }`}
            >
              <span className="text-xs font-mono text-muted-foreground w-28 shrink-0 truncate" title={process}>
                {process}
              </span>
              <span className="font-mono flex-1 truncate text-xs" title={host}>{host}</span>
              <span
                className="text-xs font-medium shrink-0"
                style={{ color: isReject ? RED : isVpn ? TEAL : 'oklch(0.6 0 0)' }}
              >
                {isReject ? 'REJECT' : isVpn ? 'VPN' : 'DIRECT'}
              </span>
              {hasError && (
                <span className="text-xs shrink-0" style={{ color: RED }}>⚠ error</span>
              )}
              {isDirect && host !== '—' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs shrink-0"
                  disabled={adding === host}
                  onClick={() => addToVpn(host)}
                  title="Добавить в VPN правила"
                >
                  <ArrowRight className="size-3 mr-1" />
                  VPN
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </BasePage>
  )
}

export default Diagnostics
