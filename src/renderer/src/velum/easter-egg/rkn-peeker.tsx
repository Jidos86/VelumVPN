import React, { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import PowerIcon from '@renderer/assets/on_icon.svg'
import { useRknPeekStore } from './rkn-peek-store'

// A little scene, triggered by clicking the title bar logo a few times (see title-bar.tsx):
// Roskomnadzor's own logo sneaks a peek in from behind the window's right edge, the connection
// icon flashes red and fires a laser at it, and it gets knocked back out. Fully self-contained
// (a decorative copy of the power icon, not the real button - this plays the same on every page,
// not just Home) and layered above everything, pointer-events-none throughout.
const SIZE = 180
const HIDDEN_RIGHT = -SIZE - 10 // fully past the window's right edge - genuinely off-window
const PEEK_RIGHT = -SIZE * 0.4 // shows most of it without covering too much of the UI
const KNOCKBACK_RIGHT = -SIZE * 2.5 // sent flying well past its usual hiding spot

const PEEK_MS = 700
const FIRE_MS = 250
const HIT_MS = 450
const HOLD_MS = 150 // beat between peeking in and getting shot

type Phase = 'idle' | 'peek' | 'fire' | 'hit'

export const RknPeeker: React.FC = () => {
  const nonce = useRknPeekStore((s) => s.nonce)
  const [phase, setPhase] = useState<Phase>('idle')
  const [beam, setBeam] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null
  )

  useEffect(() => {
    if (nonce === 0) return undefined
    setPhase('peek')
    const toFire = setTimeout(() => setPhase('fire'), PEEK_MS + HOLD_MS)
    const toHit = setTimeout(() => setPhase('hit'), PEEK_MS + HOLD_MS + FIRE_MS)
    const toIdle = setTimeout(
      () => setPhase('idle'),
      PEEK_MS + HOLD_MS + FIRE_MS + HIT_MS
    )
    return () => {
      clearTimeout(toFire)
      clearTimeout(toHit)
      clearTimeout(toIdle)
    }
  }, [nonce])

  useEffect(() => {
    if (phase !== 'fire') {
      setBeam(null)
      return
    }
    setBeam({
      x1: window.innerWidth * 0.5,
      y1: window.innerHeight * 0.38,
      x2: window.innerWidth - 10 - SIZE * 0.4,
      y2: window.innerHeight - 10 - SIZE / 2
    })
  }, [phase])

  if (phase === 'idle') return null

  const rknTarget =
    phase === 'hit'
      ? { right: KNOCKBACK_RIGHT, rotate: 35, opacity: 0 }
      : { right: PEEK_RIGHT, rotate: 0, opacity: 1 }

  return (
    <>
      <motion.div
        aria-hidden
        initial={{ right: HIDDEN_RIGHT, rotate: 0, opacity: 1 }}
        animate={rknTarget}
        transition={
          phase === 'hit'
            ? { duration: HIT_MS / 1000, ease: 'circIn' }
            : { duration: PEEK_MS / 1000, ease: 'easeOut' }
        }
        className="pointer-events-none fixed bottom-10 z-[60]"
      >
        <div
          className="overflow-hidden rounded-full shadow-lg shadow-black/50"
          style={{ width: SIZE, height: SIZE }}
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

      {(phase === 'fire' || phase === 'hit') && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1.15, 1, 1] }}
          transition={{ duration: (FIRE_MS + HIT_MS) / 1000 }}
          className="pointer-events-none fixed z-[60] flex items-center justify-center"
          style={{ left: '50%', top: '38%', transform: 'translate(-50%, -50%)' }}
        >
          <div
            className="flex size-16 items-center justify-center rounded-full"
            style={{ boxShadow: '0 0 40px 12px rgba(229,72,77,0.55)' }}
          >
            <img
              src={PowerIcon}
              alt=""
              className="size-9"
              // Force the (white) icon toward red - it has no color of its own to just override.
              style={{
                filter:
                  'brightness(0) saturate(100%) invert(38%) sepia(80%) saturate(3500%) hue-rotate(-5deg) brightness(1.05)'
              }}
            />
          </div>
        </motion.div>
      )}

      {phase === 'fire' && beam && (
        <svg className="pointer-events-none fixed inset-0 z-[60] size-full">
          <motion.line
            x1={beam.x1}
            y1={beam.y1}
            x2={beam.x2}
            y2={beam.y2}
            stroke="#e5484d"
            strokeWidth={3}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 1 }}
            animate={{ pathLength: 1, opacity: [1, 1, 0] }}
            transition={{ duration: FIRE_MS / 1000, ease: 'easeOut' }}
          />
        </svg>
      )}
    </>
  )
}
