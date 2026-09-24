import React from 'react'
import { motion } from 'motion/react'
import { useRknPeekStore } from './rkn-peek-store'

// Roskomnadzor's own logo, sneaking a peek in from behind the window's right edge whenever the
// title bar logo is clicked (see title-bar.tsx) - the agency that blocks half the internet in
// Russia, checking in on a VPN app. Positioned past the window's own edge at rest, which is what
// hides it (the OS window itself clips anything beyond its bounds - no manual overflow needed);
// it slides in for a moment, then slides back out and off-window.
const SIZE = 180
const HIDDEN_RIGHT = -SIZE - 10 // fully past the window's right edge - genuinely off-window, not just covered
const PEEK_RIGHT = -SIZE * 0.4 // shows most of it without covering too much of the UI

export const RknPeeker: React.FC = () => {
  const nonce = useRknPeekStore((s) => s.nonce)
  if (nonce === 0) return null

  return (
    <motion.div
      key={nonce}
      aria-hidden
      initial={{ right: HIDDEN_RIGHT }}
      animate={{ right: [HIDDEN_RIGHT, PEEK_RIGHT, HIDDEN_RIGHT] }}
      transition={{ duration: 1.8, times: [0, 0.5, 1], ease: 'easeInOut' }}
      className="pointer-events-none fixed bottom-10 z-[60]"
    >
      <div className="size-7 overflow-hidden rounded-full shadow-lg shadow-black/50">
        <svg viewBox="0 0 1024 1024" className="size-full">
          <path
            fill="#1e8ece"
            d="M765.748,167.568L598.331,0.151,425.5-.016-0.016,425.5v173L167.4,765.915,295.753,637.563,170.191,512,512,170.191,637.563,295.753Z"
          />
          <path fill="#0b4680" d="M512.9,339.5l173,173L512.5,685.9l-173-173Z" />
          <path
            fill="#0b4680"
            d="M258.252,856.432L425.669,1023.85l172.83,0.17L1024.02,598.5v-173L856.6,258.085,728.247,386.437,853.809,512,512,853.809,386.437,728.247Z"
          />
        </svg>
      </div>
    </motion.div>
  )
}
