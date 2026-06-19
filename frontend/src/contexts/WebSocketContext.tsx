import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'

interface WSMessage {
  event: string
  data: unknown
}

interface WSContextValue {
  lastMessage: WSMessage | null
  isConnected: boolean
  send: (data: string) => void
}

const WebSocketContext = createContext<WSContextValue>({
  lastMessage: null,
  isConnected: false,
  send: () => {},
})

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>()

  const connect = () => {
    const isFileProtocol = window.location.protocol === 'file:'
    const host = (isFileProtocol || window.location.hostname === 'localhost') ? 'localhost:8000' : window.location.host
    // Always ws:// for local backend (HTTP) — wss only if served over HTTPS
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${wsProto}//${host}/ws`)

    ws.onopen = () => {
      setIsConnected(true)
      clearTimeout(reconnectRef.current)
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WSMessage
        setLastMessage(msg)
      } catch {}
    }

    ws.onclose = () => {
      setIsConnected(false)
      // Reconnect: 1s → 2s → 4s → max 8s
      const delay = Math.min(8000, 1000 * Math.pow(2, Math.floor(Math.random() * 3)))
      reconnectRef.current = setTimeout(connect, delay)
    }

    ws.onerror = () => ws.close()

    wsRef.current = ws
  }

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [])

  const send = (data: string) => wsRef.current?.send(data)

  return (
    <WebSocketContext.Provider value={{ lastMessage, isConnected, send }}>
      {children}
    </WebSocketContext.Provider>
  )
}

export const useWebSocket = () => useContext(WebSocketContext)
