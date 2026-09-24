import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  RKN_FIRE_DELAY_MS,
  RKN_FIRE_MS,
  RKN_HIT_MS,
  useRknPeekStore
} from './rkn-peek-store'

// A little scene, triggered by clicking the title bar logo a few times (see title-bar.tsx):
// Roskomnadzor's own logo sneaks a peek in from behind the window's right edge, gets shot at by
// the real power button on Home (which flashes red and fires the laser - see home.tsx), and
// disintegrates Thanos-snap style. This overlay owns RKN itself and the laser; the power button's
// own flash lives in home.tsx since only it knows the real button's position. Everything here is
// pointer-events-none.
export const RKN_SIZE = 180
const HIDDEN_RIGHT = -RKN_SIZE - 10 // fully past the window's right edge - genuinely off-window
const PEEK_RIGHT = -RKN_SIZE * 0.4 // shows most of it without covering too much of the UI

// Where RKN sits while peeking, in screen coordinates - the laser's target.
export function rknTargetPoint(): { x: number; y: number } {
  return {
    x: window.innerWidth - 10 - RKN_SIZE * 0.4,
    y: window.innerHeight - 10 - RKN_SIZE / 2
  }
}

const RKN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path fill="%231e8ece" d="M765.748,167.568L598.331,0.151,425.5-.016-0.016,425.5v173L167.4,765.915,295.753,637.563,170.191,512,512,170.191,637.563,295.753Z"/><path fill="%230b4680" d="M512.9,339.5l173,173L512.5,685.9l-173-173Z"/><path fill="%230b4680" d="M258.252,856.432L425.669,1023.85l172.83,0.17L1024.02,598.5v-173L856.6,258.085,728.247,386.437,853.809,512,512,853.809,386.437,728.247Z"/></svg>`
// Single-quoted wrapper: the SVG markup itself uses double quotes for its attributes, which would
// otherwise terminate this url("...") early and leave the background image blank.
const RKN_DATA_URI = `url('data:image/svg+xml,${RKN_SVG}')`

// A regular grid so a shared CSS background-position slices the same image consistently.
const GRID = 12
const TILE = RKN_SIZE / GRID

interface Particle {
  col: number
  row: number
  dx: number
  dy: number
  rotate: number
  delay: number
}

type Phase = 'idle' | 'peek' | 'fire' | 'dissolve'

export const RknPeeker: React.FC = () => {
  const nonce = useRknPeekStore((s) => s.nonce)
  const powerButtonOrigin = useRknPeekStore((s) => s.powerButtonOrigin)
  const [phase, setPhase] = useState<Phase>('idle')

  // One set of random drift targets per trigger, generated once so each tile keeps its own
  // direction for the whole animation instead of jittering on every re-render.
  const particles = useMemo<Particle[]>(() => {
    if (nonce === 0) return []
    const list: Particle[] = []
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        // Drift outward from the circle's center through this tile, like ash catching the wind
        // upward, plus per-tile randomness so it does not look mechanical.
        const cx = (col + 0.5) / GRID - 0.5
        const cy = (row + 0.5) / GRID - 0.5
        const dist = 90 + Math.random() * 110
        list.push({
          col,
          row,
          dx: cx * dist + (Math.random() - 0.5) * 40,
          dy: cy * dist - 70 - Math.random() * 60, // biased upward
          rotate: (Math.random() - 0.5) * 220,
          // Left-to-right sweep (the "snap" wave), plus a little jitter so it is not a dead-flat line.
          delay: (col / GRID) * 0.35 + Math.random() * 0.08
        })
      }
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce])

  useEffect(() => {
    if (nonce === 0) return undefined
    setPhase('peek')
    const toFire = setTimeout(() => setPhase('fire'), RKN_FIRE_DELAY_MS)
    const toDissolve = setTimeout(() => setPhase('dissolve'), RKN_FIRE_DELAY_MS + RKN_FIRE_MS)
    const toIdle = setTimeout(
      () => setPhase('idle'),
      RKN_FIRE_DELAY_MS + RKN_FIRE_MS + RKN_HIT_MS
    )
    return () => {
      clearTimeout(toFire)
      clearTimeout(toDissolve)
      clearTimeout(toIdle)
    }
  }, [nonce])

  if (phase === 'idle') return null

  const target = rknTargetPoint()

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed z-[60]"
        style={{ right: PEEK_RIGHT, bottom: 40, width: RKN_SIZE, height: RKN_SIZE }}
      >
        {phase !== 'dissolve' ? (
          // Whole badge sliding in from behind the window's edge.
          <motion.div
            initial={{ x: -HIDDEN_RIGHT + PEEK_RIGHT }}
            animate={{ x: 0 }}
            transition={{ duration: RKN_FIRE_DELAY_MS / 1000, ease: 'easeOut' }}
            className="size-full overflow-hidden rounded-full shadow-lg shadow-black/50"
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
          </motion.div>
        ) : (
          // Thanos-snap dissolve: the same image sliced into a grid of tiles (a shared background
          // image with a per-tile offset), each drifting off and fading on its own.
          <div className="relative size-full">
            {particles.map((p) => (
              <motion.div
                key={`${p.col}-${p.row}`}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                animate={{ x: p.dx, y: p.dy, opacity: 0, rotate: p.rotate }}
                transition={{ duration: 0.55, delay: p.delay, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  left: p.col * TILE,
                  top: p.row * TILE,
                  width: TILE + 0.5,
                  height: TILE + 0.5,
                  backgroundImage: RKN_DATA_URI,
                  backgroundSize: `${RKN_SIZE}px ${RKN_SIZE}px`,
                  backgroundPosition: `${-p.col * TILE}px ${-p.row * TILE}px`
                }}
              />
            ))}
          </div>
        )}
      </div>

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
