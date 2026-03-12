import { useEffect, useRef, useState } from 'react'

/**
 * Measures actual rendered FPS using rAF timestamps.
 * Updates the displayed value at most once per second to avoid flicker.
 */
export function useFps() {
  const [fps, setFps] = useState(0)
  const frameTimesRef = useRef<number[]>([])
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    let lastFlush = performance.now()

    const tick = (now: number) => {
      frameTimesRef.current.push(now)

      // Flush once per second
      if (now - lastFlush >= 1000) {
        const times = frameTimesRef.current
        setFps(times.length)
        frameTimesRef.current = []
        lastFlush = now
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return fps
}
