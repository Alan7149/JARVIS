import { useEffect, useRef, useState } from 'react'

/** Smoothly animates a displayed number toward `value` whenever it changes. */
export function useCountUp(value: number, duration = 600): number {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const rafRef = useRef<number>()

  useEffect(() => {
    const from = fromRef.current
    const to = value
    if (from === to) return

    cancelAnimationFrame(rafRef.current!)
    const start = performance.now()

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setDisplay(from + (to - from) * eased)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(rafRef.current!)
  }, [value, duration])

  return display
}
