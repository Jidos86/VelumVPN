import React, { useId, useRef } from 'react'
import WindowControls from '@renderer/components/window-controls'
import { platform } from '@renderer/utils/init'
import { IS_BETA } from '@renderer/velum/flavor'
import { useRknPeekStore } from '@renderer/velum/easter-egg/rkn-peek-store'

// Easter egg: a burst of clicks on the logo makes the RKN peeker (rkn-peeker.tsx, mounted near the
// window's edge) sneak a peek in from behind the window and back out.
const TRIGGER_CLICKS = 5
const TRIGGER_WINDOW_MS = 1500

// Inline so a theme can recolour the stops. Without a theme the fallbacks are the original logo.
const LogoMark: React.FC = () => {
  const id = useId().replace(/:/g, '')
  return (
    <svg width="16" height="16" viewBox="0 0 32 32" fill="none" aria-hidden className="size-4">
      <path
        d="M16 2L4 7v9c0 6.627 5.148 11.927 12 13 6.852-1.073 12-6.373 12-13V7L16 2z"
        fill={`url(#${id}-fill)`}
        opacity="0.15"
      />
      <path
        d="M16 2L4 7v9c0 6.627 5.148 11.927 12 13 6.852-1.073 12-6.373 12-13V7L16 2z"
        stroke={`url(#${id}-stroke)`}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M11 16l3.5 3.5L21 12"
        stroke={`url(#${id}-check)`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id={`${id}-fill`} x1="4" y1="2" x2="28" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--vl-logo-from, #00d4ff)" />
          <stop offset="100%" stopColor="var(--vl-logo-fill-to, #0088cc)" />
        </linearGradient>
        <linearGradient id={`${id}-stroke`} x1="4" y1="2" x2="28" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--vl-logo-from, #00d4ff)" />
          <stop offset="100%" stopColor="var(--vl-logo-stroke-to, #0099dd)" />
        </linearGradient>
        <linearGradient id={`${id}-check`} x1="11" y1="12" x2="21" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--vl-logo-from, #00d4ff)" />
          <stop offset="100%" stopColor="var(--vl-logo-check-to, #ffffff)" />
        </linearGradient>
      </defs>
    </svg>
  )
}

const TitleBar: React.FC = () => {
  const isMac = platform === 'darwin'
  const peek = useRknPeekStore((s) => s.peek)
  const clickTimes = useRef<number[]>([])

  const handleLogoClick = (): void => {
    const now = Date.now()
    clickTimes.current = [...clickTimes.current, now].filter(
      (t) => now - t < TRIGGER_WINDOW_MS
    )
    if (clickTimes.current.length >= TRIGGER_CLICKS) {
      clickTimes.current = []
      peek()
    }
  }

  return (
    <div
      className={`app-drag flex h-8 shrink-0 select-none items-center justify-between border-b border-vl-line bg-vl-chrome pr-1.5 ${
        isMac ? 'pl-20' : 'pl-3.5'
      }`}
    >
      <button
        type="button"
        onClick={handleLogoClick}
        className="app-nodrag flex cursor-default items-center gap-2 rounded bg-transparent"
      >
        <LogoMark />
        <span className="text-xs font-semibold tracking-wide text-vl-muted">VelumVPN</span>
        {import.meta.env.DEV ? (
          <span className="rounded bg-vl-accent/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-vl-accent">
            dev
          </span>
        ) : (
          IS_BETA && (
            <span className="rounded bg-vl-accent/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-vl-accent">
              beta
            </span>
          )
        )}
      </button>
      {!isMac && (
        <div className="app-nodrag">
          <WindowControls />
        </div>
      )}
    </div>
  )
}

export default TitleBar
