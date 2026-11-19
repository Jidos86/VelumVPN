import React, { useMemo, useState } from 'react'
import useSWR from 'swr'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { LayoutGrid, LayoutList, RefreshCcw } from 'lucide-react'
import {
  getTunHealth,
  initService,
  installService,
  restartAsAdmin,
  startService,
  startWindowsService
} from '@renderer/utils/ipc'
import { GhostButton, IconButton, PrimaryButton, panelClass } from '@renderer/velum/ui/primitives'

type Layout = 'blocks' | 'table'
const LAYOUT_KEY = 'tunHealthLayout'

function readLayout(): Layout {
  try {
    return window.localStorage.getItem(LAYOUT_KEY) === 'table' ? 'table' : 'blocks'
  } catch {
    return 'blocks'
  }
}

function serviceUp(status: string): boolean {
  return /^running$/i.test(status)
}

function serviceTone(service: TunHealthService): string {
  if (serviceUp(service.status)) return 'text-vl-accent'
  if (service.status === 'unknown') return 'text-vl-muted'
  return service.required ? 'text-vl-danger' : 'text-vl-warn'
}

function adapterUp(status: string): boolean {
  return /^up$/i.test(status)
}

function statusKey(status: string): string {
  const s = status.toLowerCase()
  if (s === 'running' || s === 'up') return 'running'
  if (s === 'stopped' || s === 'disconnected') return 'stopped'
  if (s === 'missing') return 'missing'
  if (s === 'disabled' || s === 'unknown') return s
  return status
}

function levelDot(level: TunHealthLevel): string {
  if (level === 'ok') return 'bg-vl-accent'
  if (level === 'fail') return 'bg-vl-danger'
  if (level === 'warn') return 'bg-vl-warn'
  return 'bg-sky-400'
}

function kindTone(kind: TunHealthAdapter['kind']): string {
  if (kind === 'tun') return 'text-vl-accent'
  if (kind === 'vpn') return 'text-sky-400'
  return 'text-vl-muted'
}

const TunHealthPanel: React.FC = () => {
  const { t } = useTranslation()
  const [acting, setActing] = useState<string | null>(null)
  const [layout, setLayout] = useState<Layout>(readLayout)
  const { data: report, error, isValidating: loading, mutate } = useSWR('tunHealth', getTunHealth, {
    refreshInterval: acting ? 0 : 30_000
  })

  const changeLayout = (next: Layout): void => {
    setLayout(next)
    try {
      window.localStorage.setItem(LAYOUT_KEY, next)
    } catch {
      // ignore
    }
  }

  const act = async (key: string, fn: () => Promise<void>, ok: string): Promise<void> => {
    setActing(key)
    try {
      await fn()
      toast.success(ok)
      await mutate()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setActing(null)
    }
  }

  const adapters = useMemo(() => {
    const rank = { tun: 0, vpn: 1, other: 2 }
    return [...(report?.adapters ?? [])].sort(
      (a, b) => rank[a.kind] - rank[b.kind] || a.name.localeCompare(b.name)
    )
  }, [report])

  const fails = report?.checks.filter((c) => c.level === 'fail').length ?? 0
  const warns = report?.checks.filter((c) => c.level === 'warn').length ?? 0
  const facts = (report?.checks ?? []).filter((c) => !c.id.startsWith('svc-'))

  const factAction = (check: TunHealthCheck): React.ReactNode => {
    if (check.id === 'admin' && check.detail === 'no') {
      return (
        <PrimaryButton
          disabled={Boolean(acting)}
          onClick={() => void act('admin', restartAsAdmin, t('velumUi.health.restarting'))}
        >
          {t('velumUi.health.restartAdmin')}
        </PrimaryButton>
      )
    }
    if (check.id === 'helper' && check.detail === 'stopped') {
      return (
        <GhostButton disabled={Boolean(acting)} onClick={() => void act('helper', startService, t('velumUi.health.started'))}>
          {t('velumUi.health.start')}
        </GhostButton>
      )
    }
    if (check.id === 'helper' && check.detail === 'not-installed') {
      return (
        <GhostButton
          disabled={Boolean(acting)}
          onClick={() => void act('helper-install', installService, t('velumUi.health.installed'))}
        >
          {t('velumUi.health.install')}
        </GhostButton>
      )
    }
    if (check.id === 'helper' && check.detail === 'need-init') {
      return (
        <GhostButton
          disabled={Boolean(acting)}
          onClick={() => void act('helper-init', initService, t('velumUi.health.started'))}
        >
          {t('velumUi.health.init')}
        </GhostButton>
      )
    }
    return null
  }

  const startSvc = (svc: TunHealthService): React.ReactNode => {
    if (statusKey(svc.status) !== 'stopped') return null
    return (
      <GhostButton
        disabled={Boolean(acting)}
        onClick={() => void act(svc.id, () => startWindowsService(svc.id), t('velumUi.health.started'))}
      >
        {acting === svc.id ? t('velumUi.health.starting') : t('velumUi.health.start')}
      </GhostButton>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={`${panelClass} p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-vl-text">{t('velumUi.health.title')}</h2>
            <p className="mt-1 text-xs text-vl-muted">{t('velumUi.health.subtitle')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <div className="inline-flex gap-0.5 rounded-xl border border-vl-line bg-vl-tile p-0.5">
              <IconButton
                title={t('velumUi.health.layoutBlocks')}
                aria-label={t('velumUi.health.layoutBlocks')}
                className={layout === 'blocks' ? 'text-vl-text' : ''}
                onClick={() => changeLayout('blocks')}
              >
                <LayoutGrid className="size-3.5" />
              </IconButton>
              <IconButton
                title={t('velumUi.health.layoutTable')}
                aria-label={t('velumUi.health.layoutTable')}
                className={layout === 'table' ? 'text-vl-text' : ''}
                onClick={() => changeLayout('table')}
              >
                <LayoutList className="size-3.5" />
              </IconButton>
            </div>
            <GhostButton onClick={() => void mutate()} disabled={loading || Boolean(acting)}>
              <RefreshCcw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </GhostButton>
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-vl-danger">{String(error)}</p>}
        {report && (
          <p
            className={`mt-3 text-xs font-semibold ${
              fails ? 'text-vl-danger' : warns ? 'text-vl-warn' : 'text-vl-accent'
            }`}
          >
            {fails
              ? t('velumUi.health.summaryFail', { count: fails })
              : warns
                ? t('velumUi.health.summaryWarn', { count: warns })
                : t('velumUi.health.summaryOk')}
          </p>
        )}
      </div>

      {layout === 'blocks' ? (
        <>
          <div>
            <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-vl-faint">
              {t('velumUi.health.sectionStatus')}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {facts.map((check) => {
                const action = factAction(check)
                return (
                  <div key={check.id} className={`${panelClass} flex flex-col gap-3 p-4`}>
                    <div className="flex items-start gap-2.5">
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${levelDot(check.level)}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-vl-text">
                          {t(`velumUi.health.checks.${check.id}`)}
                        </div>
                        {check.detail && (
                          <div className="mt-0.5 text-xs text-vl-muted">
                            {t(`velumUi.health.details.${check.id}.${check.detail}`, {
                              defaultValue: check.detail
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    {action && <div className="mt-auto">{action}</div>}
                  </div>
                )
              })}
            </div>
          </div>

          {report?.platform === 'win32' && (
            <div>
              <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-vl-faint">
                {t('velumUi.health.sectionServices')}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {(report.services ?? []).map((svc) => {
                  return (
                    <div key={svc.id} className={`${panelClass} flex flex-col gap-3 p-4`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-vl-text">
                            {t(`velumUi.health.svc.${svc.id}`, svc.id)}
                          </div>
                          <div className="mt-0.5 text-[11px] text-vl-faint">
                            {svc.id}
                            {' · '}
                            {svc.required ? t('velumUi.health.required') : t('velumUi.health.optional')}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 text-xs font-semibold ${serviceTone(svc)}`}
                        >
                          {t(`velumUi.health.state.${statusKey(svc.status)}`, svc.status)}
                        </span>
                      </div>
                      {startSvc(svc)}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-vl-faint">
              {t('velumUi.health.adapters')}
            </h3>
            {!adapters.length && (
              <p className="text-xs text-vl-faint">{t('velumUi.health.adaptersEmpty')}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {adapters.map((adapter) => (
                <div
                  key={`${adapter.name}-${adapter.mac || adapter.description}`}
                  className={`${panelClass} flex flex-col gap-2 p-4`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-semibold ${kindTone(adapter.kind)}`}>
                      {t(`velumUi.health.kind.${adapter.kind}`)}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        adapterUp(adapter.status) ? 'text-vl-accent' : 'text-vl-faint'
                      }`}
                    >
                      {adapterUp(adapter.status)
                        ? t('velumUi.health.up')
                        : t(`velumUi.health.state.${statusKey(adapter.status)}`, t('velumUi.health.down'))}
                    </span>
                  </div>
                  <div className="truncate text-sm font-semibold text-vl-text" title={adapter.name}>
                    {adapter.name || '—'}
                  </div>
                  <div className="truncate text-xs text-vl-faint" title={adapter.description}>
                    {adapter.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className={`${panelClass} p-4`}>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-vl-faint">
              {t('velumUi.health.sectionStatus')}
            </h3>
            <div className="flex flex-col divide-y divide-vl-line">
              {facts.map((check) => (
                <div key={check.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className={`size-2 shrink-0 rounded-full ${levelDot(check.level)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-vl-text">
                      {t(`velumUi.health.checks.${check.id}`)}
                    </div>
                    {check.detail && (
                      <div className="truncate text-xs text-vl-muted">
                        {t(`velumUi.health.details.${check.id}.${check.detail}`, {
                          defaultValue: check.detail
                        })}
                      </div>
                    )}
                  </div>
                  {factAction(check)}
                </div>
              ))}
            </div>
          </div>

          {report?.platform === 'win32' && (
            <div className={`${panelClass} overflow-hidden p-4`}>
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-vl-faint">
                {t('velumUi.health.sectionServices')}
              </h3>
              <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] gap-2 px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-vl-faint">
                <span>{t('velumUi.health.colService')}</span>
                <span>{t('velumUi.health.colStatus')}</span>
                <span />
              </div>
              <div className="flex flex-col gap-1">
                {(report.services ?? []).map((svc) => {
                  return (
                    <div
                      key={svc.id}
                      className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-center gap-2 rounded-lg border border-vl-line px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-vl-text">
                          {t(`velumUi.health.svc.${svc.id}`, svc.id)}
                        </div>
                        <div className="text-[11px] text-vl-faint">
                          {svc.id}
                          {' · '}
                          {svc.required ? t('velumUi.health.required') : t('velumUi.health.optional')}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold ${serviceTone(svc)}`}
                      >
                        {t(`velumUi.health.state.${statusKey(svc.status)}`, svc.status)}
                      </span>
                      {startSvc(svc) ?? <span />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className={`${panelClass} overflow-hidden p-4`}>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-vl-faint">
              {t('velumUi.health.adapters')}
            </h3>
            {!adapters.length && (
              <p className="text-xs text-vl-faint">{t('velumUi.health.adaptersEmpty')}</p>
            )}
            <div className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto">
              {adapters.map((adapter) => (
                <div
                  key={`${adapter.name}-${adapter.mac || adapter.description}`}
                  className="grid grid-cols-[4.8rem_minmax(0,1fr)_3.5rem] items-center gap-2 rounded-lg border border-vl-line px-3 py-2 text-xs"
                >
                  <span className={`truncate font-semibold ${kindTone(adapter.kind)}`}>
                    {t(`velumUi.health.kind.${adapter.kind}`)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-vl-text" title={adapter.name}>
                      {adapter.name || '—'}
                    </span>
                    <span className="block truncate text-vl-faint" title={adapter.description}>
                      {adapter.description}
                    </span>
                  </span>
                  <span
                    className={`text-right font-semibold ${
                      adapterUp(adapter.status) ? 'text-vl-accent' : 'text-vl-faint'
                    }`}
                  >
                    {adapterUp(adapter.status)
                      ? t('velumUi.health.up')
                      : t(`velumUi.health.state.${statusKey(adapter.status)}`, t('velumUi.health.down'))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default TunHealthPanel
