import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { cn } from '@renderer/lib/utils'
import { useTranslation } from 'react-i18next'
import { calcPercent, calcTraffic } from '@renderer/utils/calc'
import dayjs from 'dayjs'
import React, { useEffect, useMemo, useState } from 'react'
import EditFileModal from './edit-file-modal'
import EditRulesModal from './edit-rules-modal'
import EditInfoModal from './edit-info-modal'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { openFile } from '@renderer/utils/ipc'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import {
  Check,
  Clock3,
  EllipsisVertical,
  ExternalLink,
  FileText,
  FolderOpen,
  HeadsetIcon,
  InfinityIcon,
  ListTree,
  Pencil,
  RefreshCcw,
  Trash2,
  X
} from 'lucide-react'
import { Cell, Pie, PieChart } from 'recharts'

interface Props {
  info: ProfileItem
  isCurrent: boolean
  addProfileItem: (item: Partial<ProfileItem>) => Promise<void>
  updateProfileItem: (item: ProfileItem) => Promise<void>
  removeProfileItem: (id: string) => Promise<void>
  onClick: () => Promise<void>
  switching: boolean
}

interface MenuItem {
  key: string
  label: string
  icon: React.ReactNode
  showDivider: boolean
  variant: 'default' | 'destructive'
}

const TrafficRing: React.FC<{
  percent: number
  size?: number
  strokeWidth?: number
  hasLimit: boolean
  expired: boolean
}> = ({ percent, size = 40, strokeWidth = 3.5, hasLimit, expired }) => {
  const normalizedPercent = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))
  const outerRadius = size / 2 - 1
  const innerRadius = Math.max(outerRadius - strokeWidth, 1)
  const exhausted = hasLimit && normalizedPercent >= 100

  const getColor = (): string => {
    if (normalizedPercent > 90) return 'var(--destructive)'
    if (normalizedPercent > 70) return 'var(--warning)'
    return 'var(--gradient-end-power-on)'
  }

  const segmentedData = Array.from({ length: 10 }, (_, index) => ({
    key: `segment-${index}`,
    value: 1
  }))

  const ringProps = {
    dataKey: 'value',
    cx: '50%',
    cy: '50%',
    innerRadius,
    outerRadius,
    startAngle: 90,
    endAngle: -270,
    stroke: 'none' as const
  }

  const renderSegmentedRing = (color: string): React.ReactNode => (
    <Pie
      {...ringProps}
      data={segmentedData}
      paddingAngle={6}
      cornerRadius={strokeWidth > 2 ? strokeWidth / 4 : 0}
      isAnimationActive={false}
    >
      {segmentedData.map((segment, index) => (
        <Cell
          key={segment.key}
          fill={color}
          fillOpacity={index % 2 === 0 ? 0.9 : 0.35}
        />
      ))}
    </Pie>
  )

  if (expired) {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <PieChart width={size} height={size}>
          {renderSegmentedRing('var(--warning)')}
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Clock3 className="size-3.5 text-warning" />
        </div>
      </div>
    )
  }

  if (!hasLimit) {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <PieChart width={size} height={size}>
          {renderSegmentedRing('var(--gradient-end-power-on)')}
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <InfinityIcon className="size-3.5 text-gradient-end-power-on" />
        </div>
      </div>
    )
  }

  if (exhausted) {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <PieChart width={size} height={size}>
          <Pie
            {...ringProps}
            data={[{ value: 100 }]}
            fill="var(--destructive)"
            fillOpacity={0.2}
            isAnimationActive={false}
          />
          <Pie {...ringProps} data={[{ value: 100 }]} fill="var(--destructive)" />
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <X className="size-3.5 text-destructive" />
        </div>
      </div>
    )
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          {...ringProps}
          data={[{ value: 100 }]}
          fill="var(--muted)"
          fillOpacity={0.3}
          isAnimationActive={false}
        />
        <Pie
          dataKey="value"
          data={[{ value: normalizedPercent }]}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          startAngle={90}
          endAngle={90 - (normalizedPercent / 100) * 360}
          fill={getColor()}
          stroke="none"
          cornerRadius={strokeWidth > 2 ? strokeWidth / 2 : 0}
          animationDuration={500}
        />
      </PieChart>
    </div>
  )
}

const ProfileItem: React.FC<Props> = (props) => {
  const { t } = useTranslation()
  const {
    info,
    addProfileItem,
    removeProfileItem,
    updateProfileItem,
    onClick,
    isCurrent,
    switching
  } = props
  const extra = info?.extra
  const usage = (extra?.upload ?? 0) + (extra?.download ?? 0)
  const total = extra?.total ?? 0
  const percent = calcPercent(extra?.upload, extra?.download, extra?.total)
  const [updating, setUpdating] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [openInfoEditor, setOpenInfoEditor] = useState(false)
  const [openFileEditor, setOpenFileEditor] = useState(false)
  const [openRulesEditor, setOpenRulesEditor] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: info.id
  })
  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null
  const [disableSelect, setDisableSelect] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const updatedFromNow = dayjs(info.updated).fromNow()
  const expireLabel = extra?.expire
    ? dayjs.unix(extra.expire).format('L')
    : t('profile.longTermValid')

  const menuItems: MenuItem[] = useMemo(() => {
    const list: MenuItem[] = [
      {
        key: 'edit-info',
        label: t('profile.editInfo'),
        icon: <Pencil />,
        showDivider: false,
        variant: 'default'
      },
      {
        key: 'edit-file',
        label: t('profile.editFile'),
        icon: <FileText />,
        showDivider: false,
        variant: 'default'
      },
      {
        key: 'edit-rules',
        label: t('profile.editRule'),
        icon: <ListTree />,
        showDivider: false,
        variant: 'default'
      },
      {
        key: 'open-file',
        label: t('profile.openFile'),
        icon: <FolderOpen />,
        showDivider: true,
        variant: 'default'
      },
      {
        key: 'delete',
        label: t('profile.delete'),
        icon: <Trash2 />,
        showDivider: false,
        variant: 'destructive'
      }
    ]
    if (info.supportUrl) {
      list.unshift({
        key: 'support',
        label: t('profile.support'),
        icon: <HeadsetIcon />,
        showDivider: false,
        variant: 'default'
      })
    }
    if (info.home) {
      list.unshift({
        key: 'home',
        label: t('profile.homepage'),
        icon: <ExternalLink />,
        showDivider: false,
        variant: 'default'
      })
    }
    return list
  }, [info, t])

  const onMenuAction = (key: string): void => {
    switch (key) {
      case 'edit-info': {
        setOpenInfoEditor(true)
        break
      }
      case 'edit-file': {
        setOpenFileEditor(true)
        break
      }
      case 'edit-rules': {
        setOpenRulesEditor(true)
        break
      }
      case 'open-file': {
        openFile(info.id)
        break
      }
      case 'delete': {
        setConfirmOpen(true)
        break
      }
      case 'home': {
        open(info.home)
        break
      }
      case 'support': {
        open(info.supportUrl)
        break
      }
    }
  }

  useEffect(() => {
    if (isDragging) {
      setTimeout(() => {
        setDisableSelect(true)
      }, 100)
    } else {
      setTimeout(() => {
        setDisableSelect(false)
      }, 100)
    }
  }, [isDragging])

  const hasLimit = total > 0
  const expired = extra?.expire ? dayjs.unix(extra.expire).isBefore(dayjs()) : false
  const percentLabel = hasLimit ? `${percent}%` : t('pages.home.unlimited')
  const handleSelect = (): void => {
    if (disableSelect || switching) return
    setSelecting(true)
    onClick().finally(() => {
      setSelecting(false)
    })
  }

  return (
    <div
      className="relative col-span-1"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 'calc(infinity)' : undefined
      }}
    >
      {openFileEditor && (
        <EditFileModal id={info.id} onClose={() => setOpenFileEditor(false)} />
      )}
      {openRulesEditor && <EditRulesModal id={info.id} onClose={() => setOpenRulesEditor(false)} />}
      {openInfoEditor && (
        <EditInfoModal
          item={info}
          isCurrent={isCurrent}
          onClose={() => setOpenInfoEditor(false)}
          updateProfileItem={updateProfileItem}
        />
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 className="size-8 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('profile.confirmDeleteProfile')}</AlertDialogTitle>
            <AlertDialogDescription className="truncate max-w-3xs">
              {info.name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setTimeout(() => {
                  removeProfileItem(info.id)
                }, 200)
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div
        role="button"
        tabIndex={0}
        aria-selected={isCurrent}
        aria-busy={selecting || switching}
        onClick={handleSelect}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleSelect()
          }
        }}
        className={cn(
          'group relative rounded-2xl border backdrop-blur-xl p-3 cursor-pointer transition-all duration-200',
          isCurrent
            ? 'border-stroke-power-on bg-linear-to-br from-gradient-start-power-on/10 to-gradient-end-power-on/10'
            : 'border-stroke bg-card/50 hover:bg-accent/50',
          selecting && 'opacity-60 scale-[0.98]',
          switching && 'cursor-wait'
        )}
      >
        <div ref={setNodeRef} {...attributes} {...listeners} className="w-full h-full">
          {/* Header row: favicon + name + badge + actions */}
          <div className="flex items-center gap-2">
            {/* Favicon or check indicator */}
            <div
              className={cn(
                'flex items-center justify-center shrink-0 size-8 rounded-lg transition-colors duration-200',
                isCurrent
                  ? 'bg-linear-to-br from-gradient-start-power-on/30 to-gradient-end-power-on/30'
                  : 'bg-muted/50'
              )}
            >
              {info.logo ? (
                <img
                  src={info.logo}
                  alt=""
                  className="size-6 rounded-sm"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    target.parentElement!.innerHTML = isCurrent
                      ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gradient-end-power-on"><polyline points="20 6 9 17 4 12"></polyline></svg>'
                      : '<span class="text-xs font-semibold text-muted-foreground">' +
                        (info.name?.charAt(0)?.toUpperCase() || 'P') +
                        '</span>'
                  }}
                />
              ) : isCurrent ? (
                <Check className="w-4 h-4 text-gradient-end-power-on" />
              ) : (
                <span className="text-xs font-semibold text-muted-foreground">
                  {info.name?.charAt(0)?.toUpperCase() || 'P'}
                </span>
              )}
            </div>

            {/* Name + type */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3
                  title={info?.name}
                  className="text-sm font-medium truncate leading-tight text-foreground"
                >
                  {info?.name}
                </h3>
                <Badge
                  variant="ghost"
                  className={cn(
                    'text-[10px] px-1.5 py-0 h-4 rounded-md font-medium shrink-0',
                    info.type === 'remote'
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  )}
                >
                  {info.type === 'remote' ? t('common.remote') : t('common.local')}
                </Badge>
              </div>
            </div>

            {/* Actions */}
            <div
              className="flex items-center shrink-0 gap-0.5 -mr-2"
              onClick={(e) => e.stopPropagation()}
            >
              {info.type === 'remote' && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={updating}
                    onClick={async () => {
                      setUpdating(true)
                      await addProfileItem(info)
                      setUpdating(false)
                    }}
                  >
                    <RefreshCcw
                      className={cn(
                        'text-base text-muted-foreground',
                        updating && 'animate-spin'
                      )}
                    />
                  </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost">
                    <EllipsisVertical className="text-base text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {menuItems.map((item) => (
                    <React.Fragment key={item.key}>
                      <DropdownMenuItem
                        variant={item.variant}
                        onClick={() => onMenuAction(item.key)}
                      >
                        {item.icon}
                        {item.label}
                      </DropdownMenuItem>
                      {item.showDivider && <DropdownMenuSeparator />}
                    </React.Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <TrafficRing
              percent={info.type === 'remote' && hasLimit ? percent : 0}
              size={34}
              hasLimit={info.type === 'remote' ? hasLimit : false}
              expired={info.type === 'remote' ? expired : false}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-foreground">
                  {info.type === 'remote' ? (
                    <>
                      {calcTraffic(usage)}
                      <span className="text-muted-foreground font-normal">
                        {' '}/ {hasLimit ? calcTraffic(total) : '∞'}
                      </span>
                    </>
                  ) : (
                    updatedFromNow
                  )}
                </span>
                {info.type === 'remote' && (
                  <span
                    className={cn(
                      'text-[10px] font-medium',
                      !hasLimit
                        ? 'text-muted-foreground'
                        : percent > 90
                          ? 'text-destructive'
                          : percent > 70
                            ? 'text-warning'
                            : 'text-gradient-end-power-on'
                    )}
                  >
                    {percentLabel}
                  </span>
                )}
              </div>
              <div className={cn(
                'text-[10px] mt-1 flex items-center justify-between',
                info.type === 'remote' && expired ? 'text-warning font-medium' : 'text-muted-foreground'
              )}>
                <span>{info.type === 'remote' && expired ? `⚠ ${expireLabel}` : expireLabel}</span>
                {info.type === 'remote' && (
                  <span className="text-muted-foreground">{updatedFromNow}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfileItem
