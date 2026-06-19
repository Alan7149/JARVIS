import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { useWebSocket } from './WebSocketContext'

export type JarvisSystemState = 'idle' | 'speaking' | 'processing' | 'alert'

export const STATE_COLORS: Record<JarvisSystemState, [number, number, number]> = {
  idle: [0, 212, 255],       // cyan
  speaking: [0, 255, 136],   // green
  processing: [255, 153, 0], // amber
  alert: [255, 51, 51],      // red
}

export const STATE_SPEED: Record<JarvisSystemState, number> = {
  idle: 1,
  speaking: 1.4,
  processing: 1.2,
  alert: 1.9,
}

export function stateColorHex(state: JarvisSystemState): string {
  const [r, g, b] = STATE_COLORS[state]
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

export function stateRgba(state: JarvisSystemState, alpha: number): string {
  const [r, g, b] = STATE_COLORS[state]
  return `rgba(${r},${g},${b},${alpha})`
}

const ALERT_DURATION_MS = 4000

interface JarvisStateContextValue {
  state: JarvisSystemState
  setProcessing: (active: boolean) => void
}

const JarvisStateContext = createContext<JarvisStateContextValue>({
  state: 'idle',
  setProcessing: () => {},
})

export function JarvisStateProvider({ children }: { children: ReactNode }) {
  const { lastMessage } = useWebSocket()
  const [speaking, setSpeaking] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [alertActive, setAlertActive] = useState(false)
  const alertTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!lastMessage) return
    const data = lastMessage.data as any

    if (lastMessage.event === 'jarvis_speaking') {
      setSpeaking(!!data?.speaking)
      return
    }

    const isAlert =
      (lastMessage.event === 'proactive_alert' && (data?.severity === 'critical' || data?.severity === 'warning')) ||
      (lastMessage.event === 'code_review' && data?.severity === 'CRITICAL') ||
      (lastMessage.event === 'network_alert') ||
      (lastMessage.event === 'notification' && (data?.severity === 'error' || data?.severity === 'warning'))

    if (isAlert) {
      setAlertActive(true)
      clearTimeout(alertTimerRef.current)
      alertTimerRef.current = setTimeout(() => setAlertActive(false), ALERT_DURATION_MS)
    }
  }, [lastMessage])

  useEffect(() => () => clearTimeout(alertTimerRef.current), [])

  let state: JarvisSystemState = 'idle'
  if (alertActive) state = 'alert'
  else if (processing) state = 'processing'
  else if (speaking) state = 'speaking'

  return (
    <JarvisStateContext.Provider value={{ state, setProcessing }}>
      {children}
    </JarvisStateContext.Provider>
  )
}

export const useJarvisState = () => useContext(JarvisStateContext)
