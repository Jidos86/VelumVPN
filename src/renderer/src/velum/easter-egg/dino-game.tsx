import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'

// The classic Chrome "no internet" dinosaur runner - a joke fitting for a VPN app, since you only
// ever see it here when the connection is very much working. Self-contained canvas game, no assets.
const WIDTH = 600
const HEIGHT = 180
const GROUND_Y = HEIGHT - 24
const GRAVITY = 0.6
const JUMP_VELOCITY = -11
const DINO_W = 22
const DINO_H = 24
const HIGH_SCORE_KEY = 'velumDinoHighScore'

interface Cactus {
  x: number
  w: number
  h: number
}

const readHighScore = (): number => {
  try {
    return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0
  } catch {
    return 0
  }
}

const writeHighScore = (value: number): void => {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(value))
  } catch {
    // no persistence, no big deal - it's a joke game
  }
}

export const DinoGame: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(readHighScore)
  const [gameOver, setGameOver] = useState(false)

  // Mutable game state lives in refs so the render loop does not fight React's own render cycle.
  const dinoY = useRef(GROUND_Y - DINO_H)
  const velocity = useRef(0)
  const jumping = useRef(false)
  const cacti = useRef<Cactus[]>([])
  const speed = useRef(6)
  const distance = useRef(0)
  const spawnTimer = useRef(0)
  const runningRef = useRef(true)
  const legPhase = useRef(0)

  const jump = (): void => {
    if (!runningRef.current) {
      restart()
      return
    }
    if (jumping.current) return
    jumping.current = true
    velocity.current = JUMP_VELOCITY
  }

  const restart = (): void => {
    dinoY.current = GROUND_Y - DINO_H
    velocity.current = 0
    jumping.current = false
    cacti.current = []
    speed.current = 6
    distance.current = 0
    spawnTimer.current = 0
    runningRef.current = true
    setScore(0)
    setGameOver(false)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.code === 'Space' || e.key === 'ArrowUp') {
        e.preventDefault()
        jump()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return undefined

    let raf = 0
    const step = (): void => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT)

      if (runningRef.current) {
        // Physics
        velocity.current += GRAVITY
        dinoY.current += velocity.current
        if (dinoY.current >= GROUND_Y - DINO_H) {
          dinoY.current = GROUND_Y - DINO_H
          velocity.current = 0
          jumping.current = false
        }

        distance.current += speed.current
        speed.current = Math.min(14, 6 + distance.current / 2500)
        legPhase.current += speed.current

        spawnTimer.current -= speed.current
        if (spawnTimer.current <= 0) {
          const h = 18 + Math.round(Math.random() * 14)
          cacti.current.push({ x: WIDTH + 10, w: 10 + Math.round(Math.random() * 8), h })
          spawnTimer.current = 55 + Math.random() * 55
        }
        cacti.current = cacti.current
          .map((c) => ({ ...c, x: c.x - speed.current }))
          .filter((c) => c.x + c.w > 0)

        // Collision (a little forgiving, like the original)
        const dinoBox = { x: 40, y: dinoY.current, w: DINO_W, h: DINO_H }
        for (const c of cacti.current) {
          const cBox = { x: c.x, y: GROUND_Y - c.h, w: c.w, h: c.h }
          const hit =
            dinoBox.x + 4 < cBox.x + cBox.w &&
            dinoBox.x + dinoBox.w - 4 > cBox.x &&
            dinoBox.y + 4 < cBox.y + cBox.h &&
            dinoBox.y + dinoBox.h > cBox.y
          if (hit) {
            runningRef.current = false
            setGameOver(true)
            setHighScore((prev) => {
              const finalScore = Math.floor(distance.current / 10)
              if (finalScore > prev) {
                writeHighScore(finalScore)
                return finalScore
              }
              return prev
            })
          }
        }
        setScore(Math.floor(distance.current / 10))
      }

      // Ground
      ctx.strokeStyle = '#535353'
      ctx.beginPath()
      ctx.moveTo(0, GROUND_Y)
      ctx.lineTo(WIDTH, GROUND_Y)
      ctx.stroke()

      // Dino: a body block, a head nub, and two alternating legs so it visibly "runs".
      ctx.fillStyle = '#535353'
      const dy = dinoY.current
      ctx.fillRect(40, dy, DINO_W, DINO_H - 6)
      ctx.fillRect(40 + DINO_W - 8, dy - 4, 8, 8)
      const legDown = Math.sin(legPhase.current / 6) > 0
      ctx.fillRect(40 + (legDown ? 2 : 10), dy + DINO_H - 6, 6, 6)
      ctx.fillRect(40 + (legDown ? 10 : 2), dy + DINO_H - 6, 6, 6)

      // Cacti
      ctx.fillStyle = '#535353'
      cacti.current.forEach((c) => {
        ctx.fillRect(c.x, GROUND_Y - c.h, c.w, c.h)
      })

      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="VelumVPN Runner"
        className="w-full max-w-[640px] overflow-hidden rounded-2xl border border-vl-line-strong bg-vl-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-vl-line px-4 py-2.5">
          <div className="text-sm font-bold text-vl-text">VelumVPN Runner</div>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-vl-faint transition-colors hover:bg-white/5 hover:text-vl-text"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex items-center justify-between px-4 pt-3 text-xs font-semibold tabular-nums text-vl-muted">
          <span>Прыжок: пробел / ↑ / клик по игре</span>
          <span>
            HI {String(highScore).padStart(5, '0')} &nbsp; {String(score).padStart(5, '0')}
          </span>
        </div>
        <div className="p-4 pt-2">
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={WIDTH}
              height={HEIGHT}
              onClick={jump}
              className="w-full cursor-pointer rounded-lg bg-[#f7f7f7]"
              style={{ height: HEIGHT }}
            />
            {gameOver && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
                <div className="rounded bg-[#f7f7f7]/90 px-3 py-1 text-sm font-bold text-[#535353]">
                  Игра окончена — клик или пробел, чтобы заново
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
