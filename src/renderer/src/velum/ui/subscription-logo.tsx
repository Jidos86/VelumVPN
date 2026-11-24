import { useEffect, useState } from 'react'

// A logo with its own background sits in a slightly rounded square. A logo sent with a
// transparent background is shown as-is, with no plate behind it.
function logoHasTransparentBackground(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = (): void => {
      const size = 16
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        resolve(false)
        return
      }
      ctx.drawImage(img, 0, 0, size, size)
      try {
        const pixels = ctx.getImageData(0, 0, size, size).data
        const corners = [0, size - 1]
        for (const y of corners) {
          for (const x of corners) {
            if (pixels[(y * size + x) * 4 + 3] < 240) {
              resolve(true)
              return
            }
          }
        }
        resolve(false)
      } catch {
        resolve(false)
      }
    }
    img.onerror = (): void => resolve(false)
    img.src = src
  })
}

export const SubscriptionLogo: React.FC<{ src: string; className?: string }> = ({
  src,
  className = 'size-6'
}) => {
  const [bare, setBare] = useState(false)

  useEffect(() => {
    let cancelled = false
    void logoHasTransparentBackground(src).then((transparent) => {
      if (!cancelled) setBare(transparent)
    })
    return (): void => {
      cancelled = true
    }
  }, [src])

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className={
        bare
          ? `${className} shrink-0 object-contain`
          : `${className} shrink-0 rounded-md border border-vl-line object-cover`
      }
      onError={(e) => {
        ;(e.target as HTMLImageElement).style.display = 'none'
      }}
    />
  )
}
