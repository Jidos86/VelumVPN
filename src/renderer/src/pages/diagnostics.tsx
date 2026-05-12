import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BasePage from '@renderer/components/base/base-page'
import { useConnectionsStore } from '@renderer/store/connections-store'
import { getCustomRules, setCustomRules, restartCore } from '@renderer/utils/ipc'
import { Button } from '@renderer/components/ui/button'
import { ArrowRight, ArrowLeft, Trash2, ArrowUpDown } from 'lucide-react'
import { toast } from 'sonner'

const TEAL = 'oklch(0.82 0.16 196)'
const RED = 'oklch(0.65 0.2 25)'
const AMBER = 'oklch(0.78 0.16 70)'

type Filter = 'all' | 'errors' | 'direct' | 'vpn'
type SortBy = 'time-desc' | 'time-asc' | 'process' | 'host' | 'errors-first'
type SelTarget = 'process' | 'host'

interface Selected {
  connId: string
  target: SelTarget
}

function isIPAddress(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host)) return true
  if (/^[0-9a-fA-F:]+(%\S+)?$/.test(host) && host.includes(':')) return true
  return false
}

function stripPort(ip: string): string {
  return ip.replace(/:\d+$/, '').replace(/^\[(.+)\]$/, '$1')
}

const Diagnostics: React.FC = () => {
  const navigate = useNavigate()
  const closed = useConnectionsStore((s) => s.closed)
  const clearAllClosed = useConnectionsStore((s) => s.clearAllClosed)
  const [filter, setFilter] = useState<Filter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('time-desc')
  const [sel, setSel] = useState<Selected | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [rules, setRules] = useState<Awaited<ReturnType<typeof getCustomRules>> | null>(null)

  const refreshRules = (): void => { getCustomRules().then(setRules) }
  useEffect(() => { refreshRules() }, [])

  const rows = useMemo(() => {
    return closed.map((conn) => {
      const process = conn.metadata.process || conn.metadata.processPath?.split(/[\\/]/).pop() || '—'
      const host = conn.metadata.host || conn.metadata.sniffHost || conn.metadata.destinationIP || '—'
      const isVpn = conn.chains.some((c) => c !== 'DIRECT' && c !== 'REJECT')
      const isDirect = conn.chains.includes('DIRECT')
      const isReject = conn.chains.includes('REJECT')
      const hasError = !isReject && conn.upload === 0 && conn.download === 0
      const isSuspect = !isReject && !hasError && conn.upload > 0 && conn.download === 0
      const hostIsIP = isIPAddress(host)
      return { conn, process, host, isVpn, isDirect, isReject, hasError, isSuspect, hostIsIP }
    }).reverse()
  }, [closed])

  const errorCount = useMemo(() => rows.filter((r) => r.hasError || r.isSuspect).length, [rows])

  const filtered = useMemo(() => {
    let result = rows
    switch (filter) {
      case 'errors': result = rows.filter((r) => r.hasError || r.isSuspect); break
      case 'direct': result = rows.filter((r) => r.isDirect); break
      case 'vpn':    result = rows.filter((r) => r.isVpn);   break
    }
    switch (sortBy) {
      case 'time-asc':     return [...result].reverse()
      case 'process':      return [...result].sort((a, b) => a.process.localeCompare(b.process))
      case 'host':         return [...result].sort((a, b) => a.host.localeCompare(b.host))
      case 'errors-first': return [...result].sort((a, b) =>
        (Number(b.hasError) * 2 + Number(b.isSuspect)) - (Number(a.hasError) * 2 + Number(a.isSuspect))
      )
      default:             return result
    }
  }, [rows, filter, sortBy])

  const clickCell = (connId: string, target: SelTarget) => {
    setSel((prev) => prev?.connId === connId && prev?.target === target ? null : { connId, target })
  }

  const toMyRulesAction = { label: 'Мои правила →', onClick: () => navigate('/custom-rules') }

  const run = async (key: string, fn: () => Promise<void>) => {
    setActing(key)
    try { await fn() } finally { setActing(null); setSel(null); refreshRules() }
  }

  const addDomainVpn = (host: string) => run(host, async () => {
    const domain = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    const rules = await getCustomRules()
    if (rules.domains.includes(domain)) { toast.info(`${domain} уже в VPN`); return }
    await setCustomRules({ ...rules, domains: [...rules.domains, domain] })
    await restartCore()
    toast.success(`${domain} → Сайты через VPN`, { action: toMyRulesAction })
  })

  const addDomainDirect = (host: string) => run(host, async () => {
    const domain = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    const rules = await getCustomRules()
    if (rules.excluded?.includes(domain)) { toast.info(`${domain} уже в обходе`); return }
    await setCustomRules({ ...rules, excluded: [...(rules.excluded ?? []), domain] })
    await restartCore()
    toast.success(`${domain} → Сайты в обход VPN`, { action: toMyRulesAction })
  })

  const addIPVpn = (host: string) => run(host, async () => {
    const ip = stripPort(host)
    const rules = await getCustomRules()
    if (rules.ips?.includes(ip)) { toast.info(`${ip} уже в VPN`); return }
    await setCustomRules({ ...rules, ips: [...(rules.ips ?? []), ip] })
    await restartCore()
    toast.success(`${ip} → IP через VPN`, { action: toMyRulesAction })
  })

  const addIPDirect = (host: string) => run(host, async () => {
    const ip = stripPort(host)
    const rules = await getCustomRules()
    if (rules.excludedIPs?.includes(ip)) { toast.info(`${ip} уже в обходе`); return }
    await setCustomRules({ ...rules, excludedIPs: [...(rules.excludedIPs ?? []), ip] })
    await restartCore()
    toast.success(`${ip} → IP в обход VPN`, { action: toMyRulesAction })
  })

  const addProcVpn = (process: string) => run(process, async () => {
    const rules = await getCustomRules()
    if (rules.processes?.includes(process)) { toast.info(`${process} уже в VPN`); return }
    await setCustomRules({ ...rules, processes: [...(rules.processes ?? []), process] })
    await restartCore()
    toast.success(`${process} → Приложения через VPN`, { action: toMyRulesAction })
  })

  const addProcDirect = (process: string) => run(process, async () => {
    const rules = await getCustomRules()
    if (rules.excludedProcesses?.includes(process)) { toast.info(`${process} уже в обходе`); return }
    await setCustomRules({ ...rules, excludedProcesses: [...(rules.excludedProcesses ?? []), process] })
    await restartCore()
    toast.success(`${process} → Приложения в обход VPN`, { action: toMyRulesAction })
  })

  const tabs: { key: Filter; label: string; count?: number }[] = [
    { key: 'all', label: 'Все', count: rows.length },
    { key: 'errors', label: 'Ошибки', count: errorCount },
    { key: 'direct', label: 'Напрямую', count: rows.filter((r) => r.isDirect).length },
    { key: 'vpn', label: 'VPN', count: rows.filter((r) => r.isVpn).length },
  ]

  const sortLabels: Record<SortBy, string> = {
    'time-desc':   'Новые',
    'time-asc':    'Старые',
    'process':     'Процесс',
    'host':        'Хост',
    'errors-first':'Ошибки ↑'
  }
  const sortOptions: SortBy[] = ['time-desc', 'time-asc', 'process', 'host', 'errors-first']
  const nextSort = () => setSortBy((s) => sortOptions[(sortOptions.indexOf(s) + 1) % sortOptions.length])

  return (
    <BasePage
      title="Диагностика"
      header={
        <div className="flex items-center gap-1 app-nodrag">
          <Button size="sm" variant="ghost" onClick={nextSort} className="h-7 px-2 text-xs text-muted-foreground gap-1">
            <ArrowUpDown className="size-3" />
            {sortLabels[sortBy]}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { clearAllClosed(); setSel(null) }} className="h-7 px-2 text-xs text-muted-foreground">
            <Trash2 className="size-3.5 mr-1" />
            Очистить
          </Button>
        </div>
      }
    >
      <div className="p-4 flex flex-col gap-3">
        {/* Filter tabs */}
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setFilter(tab.key); setSel(null) }}
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
          {filtered.map(({ conn, process, host, isVpn, isDirect, isReject, hasError, isSuspect, hostIsIP }) => {
            const selProc = sel?.connId === conn.id && sel?.target === 'process'
            const selHost = sel?.connId === conn.id && sel?.target === 'host'
            const isActing = acting === process || acting === host

            // Cross-reference with current rules
            const ip = hostIsIP ? stripPort(host) : null
            const procRuleVpn = rules?.processes?.includes(process) ?? false
            const procRuleDirect = rules?.excludedProcesses?.includes(process) ?? false
            const hostRuleVpn = rules?.domains?.includes(host) || (ip ? rules?.ips?.includes(ip) : false) || false
            const hostRuleDirect = rules?.excluded?.includes(host) || (ip ? rules?.excludedIPs?.includes(ip) : false) || false

            return (
              <div
                key={conn.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
                  hasError
                    ? 'border-destructive/40 bg-destructive/5'
                    : isSuspect
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-border bg-card'
                }`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button[data-cell]')) return
                  setSel(null)
                }}
              >
                {/* Process — clickable cell */}
                <button
                  data-cell
                  disabled={process === '—'}
                  onClick={() => clickCell(conn.id, 'process')}
                  className={`flex items-center gap-1.5 w-36 shrink-0 min-w-0 rounded px-1 py-0.5 text-left transition-colors ${
                    selProc
                      ? 'bg-primary/10 ring-1 ring-primary/40 text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  } disabled:pointer-events-none`}
                  title={
                    procRuleVpn ? `${process} — в правилах VPN` :
                    procRuleDirect ? `${process} — в обходе VPN` : process
                  }
                >
                  {(procRuleVpn || procRuleDirect) && (
                    <span
                      className="size-1.5 rounded-full shrink-0"
                      style={{ background: procRuleVpn ? TEAL : RED }}
                    />
                  )}
                  <span className="text-xs font-mono truncate">{process}</span>
                </button>

                {/* Host — clickable cell */}
                <button
                  data-cell
                  disabled={host === '—'}
                  onClick={() => clickCell(conn.id, 'host')}
                  className={`flex-1 min-w-0 rounded px-1 py-0.5 text-left transition-colors ${
                    selHost
                      ? 'bg-primary/10 ring-1 ring-primary/40 text-foreground'
                      : 'hover:text-foreground'
                  } disabled:pointer-events-none`}
                  title={
                    hostRuleVpn ? `${host} — в правилах VPN` :
                    hostRuleDirect ? `${host} — в обходе VPN` : host
                  }
                >
                  <span className="font-mono text-xs truncate flex items-center gap-1.5">
                    {(hostRuleVpn || hostRuleDirect) && (
                      <span
                        className="size-1.5 rounded-full shrink-0"
                        style={{ background: hostRuleVpn ? TEAL : RED }}
                      />
                    )}
                    {host}
                    {hostIsIP && <span className="text-muted-foreground/40 text-[10px]">IP</span>}
                  </span>
                </button>

                {/* Route badge */}
                <span
                  className="text-xs font-medium shrink-0 w-12 text-right"
                  style={{ color: isReject ? RED : isVpn ? TEAL : 'oklch(0.6 0 0)' }}
                >
                  {isReject ? 'REJECT' : isVpn ? 'VPN' : 'DIRECT'}
                </span>

                {hasError && (
                  <span className="text-[10px] font-medium shrink-0 px-1 py-0.5 rounded" style={{ color: RED, background: 'oklch(0.65 0.2 25 / 0.12)' }}>
                    нет связи
                  </span>
                )}
                {isSuspect && (
                  <span className="text-[10px] font-medium shrink-0 px-1 py-0.5 rounded" style={{ color: AMBER, background: 'oklch(0.78 0.16 70 / 0.12)' }}>
                    нет ответа
                  </span>
                )}

                {/* Action buttons — appear based on selected cell */}
                <div className="flex items-center gap-1 shrink-0 w-28 justify-end">
                  {selProc && process !== '—' && !isReject && (
                    <>
                      {procRuleVpn ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color: TEAL, background: 'oklch(0.82 0.16 196 / 0.12)' }}>
                          ✓ в VPN
                        </span>
                      ) : procRuleDirect ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color: RED, background: 'oklch(0.65 0.2 25 / 0.12)' }}>
                          ✓ в обходе
                        </span>
                      ) : (
                        <>
                          {isDirect && (
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={isActing}
                              onClick={() => addProcVpn(process)}>
                              <ArrowRight className="size-3 mr-1" style={{ color: TEAL }} />VPN
                            </Button>
                          )}
                          {isVpn && (
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={isActing}
                              onClick={() => addProcDirect(process)}>
                              <ArrowLeft className="size-3 mr-1" style={{ color: RED }} />Direct
                            </Button>
                          )}
                        </>
                      )}
                    </>
                  )}
                  {selHost && host !== '—' && !isReject && (
                    <>
                      {hostRuleVpn ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color: TEAL, background: 'oklch(0.82 0.16 196 / 0.12)' }}>
                          ✓ в VPN
                        </span>
                      ) : hostRuleDirect ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color: RED, background: 'oklch(0.65 0.2 25 / 0.12)' }}>
                          ✓ в обходе
                        </span>
                      ) : (
                        <>
                          {isDirect && (
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={isActing}
                              onClick={() => hostIsIP ? addIPVpn(host) : addDomainVpn(host)}>
                              <ArrowRight className="size-3 mr-1" style={{ color: TEAL }} />VPN
                            </Button>
                          )}
                          {isVpn && (
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={isActing}
                              onClick={() => hostIsIP ? addIPDirect(host) : addDomainDirect(host)}>
                              <ArrowLeft className="size-3 mr-1" style={{ color: RED }} />Direct
                            </Button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </BasePage>
  )
}

export default Diagnostics
