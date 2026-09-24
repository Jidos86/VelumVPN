import React, { useRef, useState } from 'react'
import { motion } from 'motion/react'
import Logo from '@renderer/assets/velumvpn-logo.svg'
import WindowControls from '@renderer/components/window-controls'
import { platform } from '@renderer/utils/init'
import { IS_BETA } from '@renderer/velum/flavor'

// Silly little easter egg: a burst of clicks on the logo makes it sprout wheels and drive off to
// the right, crashing into the minimize button - which actually minimizes the window. Windows/
// Linux only - on macOS the traffic lights live in a separate overlay outside this bar, not worth
// chasing across it.
const DRIVE_MS = 1600
const TRIGGER_CLICKS = 5
const TRIGGER_WINDOW_MS = 1500

// A plain rotating circle shows no motion (it is symmetric); a tiny off-center hub marker makes
// the spin actually readable at this size.
const Wheel: React.FC<{ className: string }> = ({ className }) => (
  <motion.span
    animate={{ rotate: 360 }}
    transition={{ duration: 0.16, repeat: Infinity, ease: 'linear' }}
    className={`absolute flex size-[9px] items-center justify-center rounded-full border-2 border-vl-panel bg-[#1c2230] ${className}`}
  >
    <span className="absolute top-px size-[2px] rounded-full bg-vl-faint" />
  </motion.span>
)

const TitleBar: React.FC = () => {
  const isMac = platform === 'darwin'
  const [driving, setDriving] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const logoRef = useRef<HTMLButtonElement>(null)
  const clickTimes = useRef<number[]>([])

  const drive = (): void => {
    if (driving) return
    const now = Date.now()
    clickTimes.current = [...clickTimes.current, now].filter((t) => now - t < TRIGGER_WINDOW_MS)
    if (clickTimes.current.length < TRIGGER_CLICKS) return
    clickTimes.current = []
    const logoRect = logoRef.current?.getBoundingClientRect()
    const minimizeRect = document.querySelector('.wc-minimize')?.getBoundingClientRect()
    if (!logoRect || !minimizeRect) return
    setOffset({
      x: minimizeRect.left + minimizeRect.width / 2 - (logoRect.left + logoRect.width / 2),
      y: minimizeRect.top + minimizeRect.height / 2 - (logoRect.top + logoRect.height / 2)
    })
    setDriving(true)
  }

  const crash = (): void => {
    window.electron.ipcRenderer.invoke('windowMinimize')
    // The window is gone by the time this would matter, but reset so the gag is ready to replay
    // once it is restored.
    setTimeout(() => setDriving(false), 50)
  }

  return (
    <div
      className={`app-drag relative flex h-8 shrink-0 select-none items-center justify-between border-b border-vl-line bg-vl-chrome pr-1.5 ${
        isMac ? 'pl-20' : 'pl-3.5'
      }`}
    >
      <button
        ref={logoRef}
        type="button"
        onClick={!isMac ? drive : undefined}
        className={`app-nodrag flex items-center gap-2 rounded bg-transparent ${isMac ? 'cursor-default' : 'cursor-pointer'} ${driving ? 'opacity-0' : ''}`}
      >
        <img src={Logo} alt="" className="size-4" draggable={false} />
        <span className="text-xs font-semibold tracking-wide text-vl-muted">VelumVPN</span>
        {IS_BETA && (
          <span className="rounded bg-vl-accent/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-vl-accent">
            beta
          </span>
        )}
      </button>
      {!isMac && (
        <div className="app-nodrag">
          <WindowControls />
        </div>
      )}

      {driving && (
        <motion.div
          aria-hidden
          initial={{ x: 0, y: 0, rotate: 0 }}
          animate={{ x: offset.x, y: offset.y, rotate: [0, -3, 3, -2, 0] }}
          transition={{ duration: DRIVE_MS / 1000, ease: 'easeIn' }}
          onAnimationComplete={crash}
          style={{
            position: 'fixed',
            left: logoRef.current?.getBoundingClientRect().left,
            top: logoRef.current?.getBoundingClientRect().top,
            width: logoRef.current?.getBoundingClientRect().width,
            height: logoRef.current?.getBoundingClientRect().height
          }}
          className="pointer-events-none z-[200] flex items-center"
        >
          {/* The whole badge is the car body, riding on two wheels at its ends - not just the
              small icon, so it actually reads as a little car and not a stray dot. */}
          <div className="relative flex items-center gap-1.5 rounded-full border border-vl-line-strong bg-vl-panel py-1 pl-2 pr-2.5 shadow-lg shadow-black/50">
            <img src={Logo} alt="" className="size-4" />
            <span className="text-xs font-semibold tracking-wide text-vl-muted">VelumVPN</span>
            <Wheel className="-bottom-[3px] left-1.5" />
            <Wheel className="-bottom-[3px] right-1.5" />
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default TitleBar
