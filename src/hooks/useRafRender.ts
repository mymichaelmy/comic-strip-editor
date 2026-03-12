import { useCallback, useRef } from 'react'

export function useRafRender(fn: () => void) {
  const rafRef = useRef<number | null>(null)

  const schedule = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      fn()
    })
  }, [fn])

  return schedule
}
