import React, { useRef, useState } from 'react'
import Logo from '@renderer/assets/velumvpn-logo.svg'
import WindowControls from '@renderer/components/window-controls'
import { platform } from '@renderer/utils/init'
import { IS_BETA } from '@renderer/velum/flavor'
import { DinoGame } from '@renderer/velum/easter-egg/dino-game'

// Easter egg: a burst of clicks on the logo opens a Chrome-dino-style runner. Silent and harmless
// otherwise - just a click counter that forgets itself if the clicks are too spread out.
const EASTER_EGG_CLICKS = 7
const EASTER_EGG_WINDOW_MS = 2000

const TitleBar: React.FC = () => {
  const isMac = platform === 'darwin'
  const [showGame, setShowGame] = useState(false)
  const clickTimes = useRef<number[]>([])

  const handleLogoClick = (): void => {
    const now = Date.now()
    clickTimes.current = [...clickTimes.current, now].filter(
      (t) => now - t < EASTER_EGG_WINDOW_MS
    )
    if (clickTimes.current.length >= EASTER_EGG_CLICKS) {
      clickTimes.current = []
      setShowGame(true)
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
      {showGame && <DinoGame onClose={() => setShowGame(false)} />}
    </div>
  )
}

export default TitleBar
