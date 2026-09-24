import React, { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  RKN_FIRE_DELAY_MS,
  RKN_FIRE_MS,
  RKN_HIT_MS,
  useRknPeekStore
} from './rkn-peek-store'

// A little scene, triggered by clicking the title bar logo a few times (see title-bar.tsx):
// Roskomnadzor's own logo sneaks a peek in from behind the window's right edge, gets shot at by
// the real power button on Home (which flashes red and fires the laser - see home.tsx), and gets
// knocked back out. This overlay owns RKN itself and the laser; the power button's own flash lives
// in home.tsx since only it knows the real button's position. Everything here is pointer-events-none.
export const RKN_SIZE = 180
const HIDDEN_RIGHT = -RKN_SIZE - 10 // fully past the window's right edge - genuinely off-window
const PEEK_RIGHT = -RKN_SIZE * 0.4 // shows most of it without covering too much of the UI
const KNOCKBACK_RIGHT = -RKN_SIZE * 2.5 // sent flying well past its usual hiding spot

// Where RKN sits while peeking, in screen coordinates - the laser's target.
export function rknTargetPoint(): { x: number; y: number } {
  return {
    x: window.innerWidth - 10 - RKN_SIZE * 0.4,
    y: window.innerHeight - 10 - RKN_SIZE / 2
  }
}

type Phase = 'idle' | 'peek' | 'fire' | 'hit'

export const RknPeeker: React.FC = () => {
  const nonce = useRknPeekStore((s) => s.nonce)
  const powerButtonOrigin = useRknPeekStore((s) => s.powerButtonOrigin)
  const [phase, setPhase] = useState<Phase>('idle')

  useEffect(() => {
    if (nonce === 0) return undefined
    setPhase('peek')
    const toFire = setTimeout(() => setPhase('fire'), RKN_FIRE_DELAY_MS)
    const toHit = setTimeout(() => setPhase('hit'), RKN_FIRE_DELAY_MS + RKN_FIRE_MS)
    const toIdle = setTimeout(
      () => setPhase('idle'),
      RKN_FIRE_DELAY_MS + RKN_FIRE_MS + RKN_HIT_MS
    )
    return () => {
      clearTimeout(toFire)
      clearTimeout(toHit)
      clearTimeout(toIdle)
    }
  }, [nonce])

  if (phase === 'idle') return null

  const rknTarget =
    phase === 'hit'
      ? { right: KNOCKBACK_RIGHT, rotate: 35, opacity: 0 }
      : { right: PEEK_RIGHT, rotate: 0, opacity: 1 }

  const target = rknTargetPoint()

  return (
    <>
      <motion.div
        aria-hidden
        initial={{ right: HIDDEN_RIGHT, rotate: 0, opacity: 1 }}
        animate={rknTarget}
        transition={
          phase === 'hit'
            ? { duration: RKN_HIT_MS / 1000, ease: 'circIn' }
            : { duration: RKN_FIRE_DELAY_MS / 1000, ease: 'easeOut' }
        }
        className="pointer-events-none fixed bottom-10 z-[60]"
      >
        <div
          className="overflow-hidden rounded-full shadow-lg shadow-black/50"
          style={{ width: RKN_SIZE, height: RKN_SIZE }}
        >
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

      {phase === 'fire' && powerButtonOrigin && (
        <svg className="pointer-events-none fixed inset-0 z-[60] size-full">
          <motion.line
            x1={powerButtonOrigin.x}
            y1={powerButtonOrigin.y}
            x2={target.x}
            y2={target.y}
            stroke="#e5484d"
            strokeWidth={3}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 1 }}
            animate={{ pathLength: 1, opacity: [1, 1, 0] }}
            transition={{ duration: RKN_FIRE_MS / 1000, ease: 'easeOut' }}
          />
        </svg>
      )}
    </>
  )
}
