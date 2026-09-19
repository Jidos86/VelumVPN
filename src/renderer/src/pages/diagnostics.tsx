import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowDownUp, ArrowLeft, ArrowRight, Check, Trash2 } from 'lucide-react'
import { useConnectionsStore } from '@renderer/store/connections-store'
import { CustomRules, getCustomRules, setCustomRules } from '@renderer/utils/ipc'
import { applyRulesChange } from '@renderer/velum/rules/apply-rules'
import { GhostButton, PageShell, Segmented, panelClass } from '@renderer/velum/ui/primitives'

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

// Where an action from this page lands: list field, whether it is the VPN side, toast label.
const TARGETS = {
  domains: { vpn: true, label: 'Сайты через VPN' },
  excluded: { vpn: false, label: 'Сайты в обход VPN' },
  ips: { vpn: true, label: 'IP через VPN' },
  excludedIPs: { vpn: false, label: 'IP в обход VPN' },
  processes: { vpn: true, label: 'Приложения через VPN' },
  excludedProcesses: { vpn: false, label: 'Приложения в обход VPN' }
} as const

const sortOptions: SortBy[] = ['time-desc', 'time-asc', 'process', 'host', 'errors-first']

const Diagnostics: React.FC = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const closed = useConnectionsStore((s) => s.closed)
  const clearAllClosed = useConnectionsStore((s) => s.clearAllClosed)
  const [filter, setFilter] = useState<Filter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('time-desc')
  const [sel, setSel] = useState<Selected | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [rules, setRules] = useState<CustomRules | null>(null)

  const refreshRules = (): void => {
    getCustomRules().then(setRules)
  }
  useEffect(() => {
    refreshRules()
  }, [])

  const rows = useMemo(() => {
    return closed
      .map((conn) => {
        const process =
          conn.metadata.process || conn.metadata.processPath?.split(/[\\/]/).pop() || '—'
        const host =
          conn.metadata.host || conn.metadata.sniffHost || conn.metadata.destinationIP || '—'
        const isVpn = conn.chains.some((c) => c !== 'DIRECT' && c !== 'REJECT')
        const isDirect = conn.chains.includes('DIRECT')
        const isReject = conn.chains.includes('REJECT')
        const hasError = !isReject && conn.upload === 0 && conn.download === 0
        const isSuspect = !isReject && !hasError && conn.upload > 0 && conn.download === 0
        const hostIsIP = isIPAddress(host)
        return { conn, process, host, isVpn, isDirect, isReject, hasError, isSuspect, hostIsIP }
      })
      .reverse()
  }, [closed])

  const errorCount = useMemo(() => rows.filter((r) => r.hasError || r.isSuspect).length, [rows])

  const filtered = useMemo(() => {
    let result = rows
    switch (filter) {
      case 'errors':
        result = rows.filter((r) => r.hasError || r.isSuspect)
        break
      case 'direct':
        result = rows.filter((r) => r.isDirect)
        break
      case 'vpn':
        result = rows.filter((r) => r.isVpn)
        break
    }
    switch (sortBy) {
      case 'time-asc':
        return [...result].reverse()
      case 'process':
        return [...result].sort((a, b) => a.process.localeCompare(b.process))
      case 'host':
        return [...result].sort((a, b) => a.host.localeCompare(b.host))
      case 'errors-first':
        return [...result].sort(
          (a, b) =>
            Number(b.hasError) * 2 + Number(b.isSuspect) - (Number(a.hasError) * 2 + Number(a.isSuspect))
        )
      default:
        return result
    }
  }, [rows, filter, sortBy])

  const clickCell = (connId: string, target: SelTarget): void => {
    setSel((prev) => (prev?.connId === connId && prev?.target === target ? null : { connId, target }))
  }

  const run = async (key: string, fn: () => Promise<void>): Promise<void> => {
    setActing(key)
    try {
      await fn()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setActing(null)
      setSel(null)
      refreshRules()
    }
  }

  const addTo = (field: keyof typeof TARGETS, value: string): Promise<void> =>
    run(value, async () => {
      const current = await getCustomRules()
      const list = current[field] ?? []
      if (list.includes(value)) {
        toast.info(`${value} ${TARGETS[field].vpn ? 'уже в VPN' : 'уже в обходе'}`)
        return
      }
      await setCustomRules({ ...current, [field]: [...list, value] })
      await applyRulesChange()
      toast.success(`${value} → ${TARGETS[field].label}`, {
        action: { label: 'Мои правила →', onClick: () => navigate('/custom-rules') }
      })
    })

  const domainOf = (host: string): string => host.replace(/^https?:\/\//, '').replace(/\/.*$/, '')

  const filterItems = [
    { key: 'all' as const, label: `${t('velumUi.diag.all')} ${rows.length}` },
    { key: 'errors' as const, label: `${t('velumUi.diag.errors')} ${errorCount}` },
    { key: 'direct' as const, label: `${t('velumUi.diag.direct')} ${rows.filter((r) => r.isDirect).length}` },
    { key: 'vpn' as const, label: `VPN ${rows.filter((r) => r.isVpn).length}` }
  ]

  const sortLabels: Record<SortBy, string> = {
    'time-desc': t('velumUi.diag.sortNew'),
    'time-asc': t('velumUi.diag.sortOld'),
    process: t('velumUi.diag.sortProcess'),
    host: t('velumUi.diag.sortHost'),
    'errors-first': t('velumUi.diag.sortErrors')
  }

  const chip = (tone: 'accent' | 'danger' | 'warn', text: string): React.ReactNode => (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
        tone === 'accent'
          ? 'bg-vl-accent/12 text-vl-accent'
          : tone === 'danger'
            ? 'bg-vl-danger/12 text-vl-danger'
            : 'bg-vl-warn/12 text-vl-warn'
      }`}
    >
      {text}
    </span>
  )

  return (
    <PageShell
      title={t('sider.diagnostics')}
      subtitle={t('velumUi.diag.subtitle')}
      actions={
        <>
          <GhostButton
            onClick={() => setSortBy((s) => sortOptions[(sortOptions.indexOf(s) + 1) % sortOptions.length])}
          >
            <ArrowDownUp className="size-3.5" />
            {sortLabels[sortBy]}
          </GhostButton>
          <GhostButton
            onClick={() => {
              clearAllClosed()
              setSel(null)
            }}
          >
            <Trash2 className="size-3.5" />
            {t('velumUi.diag.clear')}
          </GhostButton>
        </>
      }
    >
      <div>
        <Segmented
          items={filterItems}
          value={filter}
          onChange={(k) => {
            setFilter(k)
            setSel(null)
          }}
        />
      </div>

      {filtered.length === 0 && (
        <div className="py-10 text-center text-sm text-vl-faint">{t('velumUi.diag.empty')}</div>
      )}

      <div className={`${panelClass} ${filtered.length === 0 ? 'hidden' : ''} p-2`}>
        {filtered.map(({ conn, process, host, isVpn, isDirect, isReject, hasError, isSuspect, hostIsIP }) => {
          const selProc = sel?.connId === conn.id && sel?.target === 'process'
          const selHost = sel?.connId === conn.id && sel?.target === 'host'
          const isActing = acting === process || acting === host

          // Cross-reference with current rules
          const ip = hostIsIP ? stripPort(host) : null
          const procRuleVpn = rules?.processes?.includes(process) ?? false
          const procRuleDirect = rules?.excludedProcesses?.includes(process) ?? false
          const hostRuleVpn =
            rules?.domains?.includes(host) || (ip ? rules?.ips?.includes(ip) : false) || false
          const hostRuleDirect =
            rules?.excluded?.includes(host) || (ip ? rules?.excludedIPs?.includes(ip) : false) || false

          const actionsFor = (
            ruleVpn: boolean,
            ruleDirect: boolean,
            toVpn: () => void,
            toDirect: () => void
          ): React.ReactNode => {
            if (ruleVpn) return chip('accent', '✓ VPN')
            if (ruleDirect) return chip('danger', `✓ ${t('velumUi.diag.bypass')}`)
            return (
              <>
                {isDirect && (
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={toVpn}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-vl-line px-2 py-1 text-xs font-semibold text-vl-text transition-colors hover:border-vl-accent/50 disabled:opacity-50"
                  >
                    <ArrowRight className="size-3 text-vl-accent" />
                    VPN
                  </button>
                )}
                {isVpn && (
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={toDirect}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-vl-line px-2 py-1 text-xs font-semibold text-vl-text transition-colors hover:border-vl-danger/50 disabled:opacity-50"
                  >
                    <ArrowLeft className="size-3 text-vl-danger" />
                    {t('velumUi.diag.bypass')}
                  </button>
                )}
              </>
            )
          }

          const cellClass = (selected: boolean): string =>
            `flex min-w-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-left transition-colors disabled:pointer-events-none ${
              selected
                ? 'bg-vl-accent/12 text-vl-text ring-1 ring-vl-accent/40'
                : 'text-vl-muted hover:bg-white/5 hover:text-vl-text'
            }`

          return (
            <div
              key={conn.id}
              className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm transition-colors ${
                hasError
                  ? 'bg-vl-danger/6'
                  : isSuspect
                    ? 'bg-vl-warn/6'
                    : 'hover:bg-white/3'
              }`}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button[data-cell]')) return
                setSel(null)
              }}
            >
              <button
                data-cell
                type="button"
                disabled={process === '—'}
                onClick={() => clickCell(conn.id, 'process')}
                className={`${cellClass(selProc)} w-36 shrink-0`}
                title={
                  procRuleVpn
                    ? `${process} — в правилах VPN`
                    : procRuleDirect
                      ? `${process} — в обходе VPN`
                      : process
                }
              >
                {(procRuleVpn || procRuleDirect) && (
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${procRuleVpn ? 'bg-vl-accent' : 'bg-vl-danger'}`}
                  />
                )}
                <span className="truncate font-mono text-xs">{process}</span>
              </button>

              <button
                data-cell
                type="button"
                disabled={host === '—'}
                onClick={() => clickCell(conn.id, 'host')}
                className={`${cellClass(selHost)} flex-1`}
                title={
                  hostRuleVpn
                    ? `${host} — в правилах VPN`
                    : hostRuleDirect
                      ? `${host} — в обходе VPN`
                      : host
                }
              >
                {(hostRuleVpn || hostRuleDirect) && (
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${hostRuleVpn ? 'bg-vl-accent' : 'bg-vl-danger'}`}
                  />
                )}
                <span className="truncate font-mono text-xs">{host}</span>
                {hostIsIP && <span className="text-[10px] text-vl-faint">IP</span>}
              </button>

              <span
                className={`w-14 shrink-0 text-right text-xs font-semibold ${
                  isReject ? 'text-vl-danger' : isVpn ? 'text-vl-accent' : 'text-vl-muted'
                }`}
              >
                {isReject ? 'REJECT' : isVpn ? 'VPN' : 'DIRECT'}
              </span>

              {hasError && chip('danger', t('velumUi.diag.noLink'))}
              {isSuspect && chip('warn', t('velumUi.diag.noReply'))}

              <div className="flex w-32 shrink-0 items-center justify-end gap-1">
                {selProc &&
                  process !== '—' &&
                  !isReject &&
                  actionsFor(
                    procRuleVpn,
                    procRuleDirect,
                    () => addTo('processes', process),
                    () => addTo('excludedProcesses', process)
                  )}
                {selHost &&
                  host !== '—' &&
                  !isReject &&
                  actionsFor(
                    hostRuleVpn,
                    hostRuleDirect,
                    () => addTo(hostIsIP ? 'ips' : 'domains', hostIsIP ? stripPort(host) : domainOf(host)),
                    () =>
                      addTo(hostIsIP ? 'excludedIPs' : 'excluded', hostIsIP ? stripPort(host) : domainOf(host))
                  )}
              </div>
            </div>
          )
        })}
      </div>
      {filtered.length > 0 && (
        <div className="flex items-center gap-1.5 px-1 text-[11px] text-vl-faint">
          <Check className="size-3" />
          {t('velumUi.diag.hint')}
        </div>
      )}
    </PageShell>
  )
}

export default Diagnostics
