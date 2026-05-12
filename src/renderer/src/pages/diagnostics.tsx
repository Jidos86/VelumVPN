import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BasePage from '@renderer/components/base/base-page'
import { useConnectionsStore } from '@renderer/store/connections-store'
import { getCustomRules, setCustomRules, restartCore } from '@renderer/utils/ipc'
import { Button } from '@renderer/components/ui/button'
import { ArrowRight, ArrowLeft, Trash2, Monitor } from 'lucide-react'
import { toast } from 'sonner'

const TEAL = 'oklch(0.82 0.16 196)'
const RED = 'oklch(0.65 0.2 25)'

type Filter = 'all' | 'errors' | 'direct' | 'vpn'

function isIPAddress(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host)) return true
  if (/^[0-9a-fA-F:]+(%\S+)?$/.test(host) && host.includes(':')) return true
  return false
}

const Diagnostics: React.FC = () => {
  const navigate = useNavigate()
  const closed = useConnectionsStore((s) => s.closed)
  const clearAllClosed = useConnectionsStore((s) => s.clearAllClosed)
  const [filter, setFilter] = useState<Filter>('all')
  const [actingHost, setActingHost] = useState<string | null>(null)
  const [actingProc, setActingProc] = useState<string | null>(null)

  const rows = useMemo(() => {
    return closed.map((conn) => {
      const process = conn.metadata.process || conn.metadata.processPath?.split(/[\\/]/).pop() || '—'
      const host = conn.metadata.host || conn.metadata.sniffHost || conn.metadata.destinationIP || '—'
      const isVpn = conn.chains.some((c) => c !== 'DIRECT' && c !== 'REJECT')
      const isDirect = conn.chains.includes('DIRECT')
      const isReject = conn.chains.includes('REJECT')
      const hasError = !isReject && conn.upload === 0 && conn.download === 0
      const hostIsIP = isIPAddress(host)
      return { conn, process, host, isVpn, isDirect, isReject, hasError, hostIsIP }
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

  const toMyRulesAction = { label: 'Мои правила →', onClick: () => navigate('/custom-rules') }

  const addDomainToVpn = async (host: string) => {
    if (!host || host === '—') return
    const domain = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    setActingHost(domain)
    try {
      const rules = await getCustomRules()
      if (rules.domains.includes(domain)) { toast.info(`${domain} уже в VPN`); return }
      await setCustomRules({ ...rules, domains: [...rules.domains, domain] })
      await restartCore()
      toast.success(`${domain} → Сайты через VPN`, { action: toMyRulesAction })
    } catch (e) { toast.error(String(e)) }
    finally { setActingHost(null) }
  }

  const addDomainToDirect = async (host: string) => {
    if (!host || host === '—') return
    const domain = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    setActingHost(domain)
    try {
      const rules = await getCustomRules()
      if (rules.excluded?.includes(domain)) { toast.info(`${domain} уже в обходе VPN`); return }
      await setCustomRules({ ...rules, excluded: [...(rules.excluded ?? []), domain] })
      await restartCore()
      toast.success(`${domain} → Сайты в обход VPN`, { action: toMyRulesAction })
    } catch (e) { toast.error(String(e)) }
    finally { setActingHost(null) }
  }

  const addProcessToVpn = async (process: string) => {
    if (!process || process === '—') return
    setActingProc(process)
    try {
      const rules = await getCustomRules()
      if (rules.processes?.includes(process)) { toast.info(`${process} уже в VPN`); return }
      await setCustomRules({ ...rules, processes: [...(rules.processes ?? []), process] })
      await restartCore()
      toast.success(`${process} → Приложения через VPN`, { action: toMyRulesAction })
    } catch (e) { toast.error(String(e)) }
    finally { setActingProc(null) }
  }

  const addProcessToDirect = async (process: string) => {
    if (!process || process === '—') return
    setActingProc(process)
    try {
      const rules = await getCustomRules()
      if (rules.excludedProcesses?.includes(process)) { toast.info(`${process} уже в обходе VPN`); return }
      await setCustomRules({ ...rules, excludedProcesses: [...(rules.excludedProcesses ?? []), process] })
      await restartCore()
      toast.success(`${process} → Приложения в обход VPN`, { action: toMyRulesAction })
    } catch (e) { toast.error(String(e)) }
    finally { setActingProc(null) }
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
                filter === tab.key ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1" style={{ color: tab.key === 'errors' ? RED : 'oklch(0.6 0 0)' }}>
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
          {filtered.map(({ conn, process, host, isVpn, isDirect, isReject, hasError, hostIsIP }) => (
            <div
              key={conn.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm ${
                hasError ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card'
              }`}
            >
              {/* Process cell + process action buttons */}
              <div className="flex items-center gap-1 w-40 shrink-0 min-w-0">
                <Monitor className="size-3 text-muted-foreground shrink-0" />
                <span className="text-xs font-mono text-muted-foreground truncate flex-1" title={process}>
                  {process}
                </span>
                {process !== '—' && (
                  <>
                    <button
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                      disabled={actingProc === process}
                      onClick={() => addProcessToVpn(process)}
                      title={`${process} → Приложения через VPN`}
                    >
                      <ArrowRight className="size-3" style={{ color: TEAL }} />
                    </button>
                    <button
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                      disabled={actingProc === process}
                      onClick={() => addProcessToDirect(process)}
                      title={`${process} → Приложения в обход VPN`}
                    >
                      <ArrowLeft className="size-3" style={{ color: RED }} />
                    </button>
                  </>
                )}
              </div>

              {/* Host */}
              <span className="font-mono flex-1 truncate text-xs" title={host}>
                {host}
                {hostIsIP && (
                  <span className="ml-1 text-muted-foreground/50 text-[10px]">IP</span>
                )}
              </span>

              {/* Route badge */}
              <span
                className="text-xs font-medium shrink-0 w-12 text-right"
                style={{ color: isReject ? RED : isVpn ? TEAL : 'oklch(0.6 0 0)' }}
              >
                {isReject ? 'REJECT' : isVpn ? 'VPN' : 'DIRECT'}
              </span>

              {hasError && (
                <span className="text-xs shrink-0" style={{ color: RED }}>⚠</span>
              )}

              {/* Domain action buttons — only for real domains, not IPs */}
              {!hostIsIP && host !== '—' && isDirect && (
                <Button
                  size="sm" variant="outline"
                  className="h-6 px-2 text-xs shrink-0"
                  disabled={actingHost === host}
                  onClick={() => addDomainToVpn(host)}
                  title="Домен → Сайты через VPN"
                >
                  <ArrowRight className="size-3 mr-1" />VPN
                </Button>
              )}
              {!hostIsIP && host !== '—' && isVpn && (
                <Button
                  size="sm" variant="outline"
                  className="h-6 px-2 text-xs shrink-0"
                  disabled={actingHost === host}
                  onClick={() => addDomainToDirect(host)}
                  title="Домен → Сайты в обход VPN"
                >
                  <ArrowLeft className="size-3 mr-1" />Direct
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
