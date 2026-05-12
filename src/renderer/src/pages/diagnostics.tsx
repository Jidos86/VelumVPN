import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BasePage from '@renderer/components/base/base-page'
import { useConnectionsStore } from '@renderer/store/connections-store'
import { getCustomRules, setCustomRules, restartCore } from '@renderer/utils/ipc'
import { Button } from '@renderer/components/ui/button'
import { ArrowRight, ArrowLeft, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

const TEAL = 'oklch(0.82 0.16 196)'
const RED = 'oklch(0.65 0.2 25)'

type Filter = 'all' | 'errors' | 'direct' | 'vpn'

const Diagnostics: React.FC = () => {
  const navigate = useNavigate()
  const closed = useConnectionsStore((s) => s.closed)
  const clearAllClosed = useConnectionsStore((s) => s.clearAllClosed)
  const [filter, setFilter] = useState<Filter>('all')
  const [acting, setActing] = useState<string | null>(null)

  const rows = useMemo(() => {
    return closed.map((conn) => {
      const process = conn.metadata.process || conn.metadata.processPath?.split(/[\\/]/).pop() || '—'
      const host = conn.metadata.host || conn.metadata.sniffHost || conn.metadata.destinationIP || '—'
      const isVpn = conn.chains.some((c) => c !== 'DIRECT' && c !== 'REJECT')
      const isDirect = conn.chains.includes('DIRECT')
      const isReject = conn.chains.includes('REJECT')
      const hasError = !isReject && conn.upload === 0 && conn.download === 0
      return { conn, process, host, isVpn, isDirect, isReject, hasError }
    }).reverse()
  }, [closed])

  const errorCount = useMemo(() => rows.filter((r) => r.hasError).length, [rows])

  const filtered = useMemo(() => {
    switch (filter) {
      case 'errors': return rows.filter((r) => r.hasError)
      case 'direct': return rows.filter((r) => r.isDirect)
      case 'vpn': return rows.filter((r) => r.isVpn)
      default: return rows
    }
  }, [rows, filter])

  const toMyRulesAction = {
    label: 'Мои правила →',
    onClick: () => navigate('/custom-rules')
  }

  const addToVpn = async (host: string) => {
    if (!host || host === '—') return
    const domain = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    setActing(domain)
    try {
      const rules = await getCustomRules()
      if (rules.domains.includes(domain)) {
        toast.info(`${domain} уже в правилах VPN`)
        return
      }
      const next = { ...rules, domains: [...rules.domains, domain] }
      await setCustomRules(next)
      await restartCore()
      toast.success(`${domain} → Сайты через VPN`, { action: toMyRulesAction })
    } catch (e) {
      toast.error(String(e))
    } finally {
      setActing(null)
    }
  }

  const addToDirect = async (host: string) => {
    if (!host || host === '—') return
    const domain = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    setActing(domain)
    try {
      const rules = await getCustomRules()
      if (rules.excluded?.includes(domain)) {
        toast.info(`${domain} уже в обходе VPN`)
        return
      }
      const next = { ...rules, excluded: [...(rules.excluded ?? []), domain] }
      await setCustomRules(next)
      await restartCore()
      toast.success(`${domain} → Сайты в обход VPN`, { action: toMyRulesAction })
    } catch (e) {
      toast.error(String(e))
    } finally {
      setActing(null)
    }
  }

  const tabs: { key: Filter; label: string; count?: number }[] = [
    { key: 'all', label: 'Все', count: rows.length },
    { key: 'errors', label: 'Ошибки', count: errorCount },
    { key: 'direct', label: 'Напрямую', count: rows.filter((r) => r.isDirect).length },
    { key: 'vpn', label: 'VPN', count: rows.filter((r) => r.isVpn).length },
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
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className="ml-1"
                  style={{ color: tab.key === 'errors' ? RED : 'oklch(0.6 0 0)' }}
                >
                  ({tab.count})
                </span>
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
              className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm ${
                hasError
                  ? 'border-destructive/40 bg-destructive/5'
                  : 'border-border bg-card'
              }`}
            >
              <span className="text-xs font-mono text-muted-foreground w-24 shrink-0 truncate" title={process}>
                {process}
              </span>
              <span className="font-mono flex-1 truncate text-xs" title={host}>{host}</span>
              <span
                className="text-xs font-medium shrink-0 w-12 text-right"
                style={{ color: isReject ? RED : isVpn ? TEAL : 'oklch(0.6 0 0)' }}
              >
                {isReject ? 'REJECT' : isVpn ? 'VPN' : 'DIRECT'}
              </span>
              {hasError && (
                <span className="text-xs shrink-0" style={{ color: RED }}>⚠</span>
              )}
              {isDirect && host !== '—' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs shrink-0"
                  disabled={acting === host}
                  onClick={() => addToVpn(host)}
                  title="Добавить в Сайты через VPN"
                >
                  <ArrowRight className="size-3 mr-1" />
                  VPN
                </Button>
              )}
              {isVpn && host !== '—' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs shrink-0"
                  disabled={acting === host}
                  onClick={() => addToDirect(host)}
                  title="Добавить в Сайты в обход VPN"
                >
                  <ArrowLeft className="size-3 mr-1" />
                  Direct
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
