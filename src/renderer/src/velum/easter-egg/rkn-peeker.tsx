import React from 'react'
import { motion } from 'motion/react'

// Roskomnadzor's own logo, peeking out from behind the sidebar every so often - the agency that
// blocks half the internet in Russia, sneaking a look at a VPN app. Purely decorative: no clicks,
// no hover logic, nothing that can misfire. Sits at a lower z-index than the sidebar (see
// nav-rail.tsx's z-[45]), so the collapsed rail's opaque background hides most of it, and the
// expanded (hover) rail covers it completely - it only shows past the rail's right edge.
const HIDDEN_X = -8 // mostly tucked behind the collapsed 56px rail
const PEEK_X = 12 // pokes this far past the rail's right edge

export const RknPeeker: React.FC = () => (
  <motion.div
    aria-hidden
    initial={{ x: HIDDEN_X }}
    animate={{ x: [HIDDEN_X, PEEK_X, HIDDEN_X] }}
    transition={{
      duration: 1.6,
      times: [0, 0.55, 1],
      ease: 'easeInOut',
      repeat: Infinity,
      repeatDelay: 9
    }}
    className="pointer-events-none absolute left-14 top-1/2 z-20 -translate-y-1/2"
  >
    <div className="size-6 overflow-hidden rounded-full shadow-lg shadow-black/50">
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
