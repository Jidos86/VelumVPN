import React, { useEffect, useId } from 'react'
import { X } from 'lucide-react'
import { motion } from 'motion/react'

export const panelClass = 'rounded-2xl border border-vl-line bg-vl-panel'

// Standard page frame: padding, title row with optional subtitle and actions, scrolling body.
export const PageShell: React.FC<{
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}> = ({ title, subtitle, actions, children }) => (
  <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-5">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold text-vl-text">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-vl-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
    {children}
  </div>
)

export const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className = '',
  ...props
}) => (
  <button
    type="button"
    {...props}
    className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-vl-accent px-3 py-2 text-xs font-bold text-vl-bg transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50 ${className}`}
  />
)

export const GhostButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className = '',
  ...props
}) => (
  <button
    type="button"
    {...props}
    className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-vl-muted transition-colors hover:bg-white/5 hover:text-vl-text disabled:cursor-default disabled:opacity-50 ${className}`}
  />
)

export const IconButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'default' | 'danger' | 'accent' }
> = ({ className = '', tone = 'default', ...props }) => (
  <button
    type="button"
    {...props}
    className={`cursor-pointer rounded-md p-1.5 text-vl-faint transition-colors disabled:cursor-default disabled:opacity-50 ${
      tone === 'danger'
        ? 'hover:text-vl-danger'
        : tone === 'accent'
          ? 'hover:text-vl-accent'
          : 'hover:text-vl-text'
    } ${className}`}
  />
)

export interface SegmentedItem<T extends string> {
  key: T
  label: React.ReactNode
}

// Pill tabs used for in-page sections (rules kind, settings groups, filters). The active pill
// glides between items instead of jumping; each instance gets its own layoutId (via useId) so
// several Segmented groups on the same page never mix their highlights up.
export function Segmented<T extends string>({
  items,
  value,
  onChange
}: {
  items: SegmentedItem<T>[]
  value: T
  onChange: (key: T) => void
}): React.ReactElement {
  const layoutId = useId()
  return (
    <div className="inline-flex gap-1 rounded-xl border border-vl-line bg-vl-panel p-1">
      {items.map((item) => {
        const active = value === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={`relative cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
              active ? 'text-vl-text' : 'text-vl-muted transition-colors hover:text-vl-text'
            }`}
          >
            {active && (
              <motion.span
                layoutId={`${layoutId}-pill`}
                aria-hidden
                className="absolute inset-0 rounded-lg bg-vl-accent/16"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export const Switch: React.FC<{
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
}> = ({ checked, onChange, disabled, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-default disabled:opacity-50 ${
      checked ? 'bg-vl-accent' : 'bg-white/12'
    }`}
  >
    <span
      className={`absolute top-0.5 size-4 rounded-full bg-vl-text transition-all ${
        checked ? 'left-[18px] bg-vl-bg' : 'left-0.5'
      }`}
    />
  </button>
)

// Overlay dialog that starts below the 32px title bar so window controls stay reachable.
export const Modal: React.FC<{
  title: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  widthClass?: string
}> = ({ title, onClose, children, footer, widthClass = 'max-w-md' }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-8 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        className={`flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-vl-line-strong bg-vl-bg shadow-2xl ${widthClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="text-base font-bold text-vl-text">{title}</div>
          <IconButton aria-label="close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-vl-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input
      ref={ref}
      {...props}
      className={`w-full rounded-xl border border-vl-line bg-vl-tile px-3 py-2 text-sm text-vl-text outline-none transition-colors placeholder:text-vl-faint focus:border-vl-accent/50 disabled:opacity-50 ${className}`}
    />
  )
)
TextInput.displayName = 'TextInput'
