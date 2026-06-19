import { createContext, useContext, useCallback, useEffect, useRef, useState, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Info, CheckCircle, AlertTriangle, AlertOctagon, X } from 'lucide-react'
import { useWebSocket } from '../contexts/WebSocketContext'
import { playNotification, playAlert } from '../lib/sounds'

export type ToastSeverity = 'info' | 'success' | 'warning' | 'error' | 'critical'

interface Toast {
  id: number
  title: string
  message: string
  severity: ToastSeverity
  duration: number
}

type AddToast = (t: { title: string; message?: string; severity?: ToastSeverity; duration?: number }) => void

const ToastContext = createContext<{ addToast: AddToast }>({ addToast: () => {} })

const SEVERITY_STYLE: Record<ToastSeverity, { color: string; icon: typeof Info }> = {
  info: { color: '#00d4ff', icon: Info },
  success: { color: '#00ff88', icon: CheckCircle },
  warning: { color: '#ff9900', icon: AlertTriangle },
  error: { color: '#ff3333', icon: AlertOctagon },
  critical: { color: '#ff3333', icon: AlertOctagon },
}

function ToastCard({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const { color, icon: Icon } = SEVERITY_STYLE[toast.severity]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 60, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="toast-card"
      style={{
        pointerEvents: 'auto',
        position: 'relative',
        overflow: 'hidden',
        background: 'rgba(4,22,40,0.92)',
        border: `1px solid ${color}66`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 4,
        backdropFilter: 'blur(8px)',
        boxShadow: `0 0 16px ${color}33, 0 4px 12px rgba(0,0,0,0.4)`,
        padding: '10px 12px',
      }}
    >
      {/* Scanline sweep on entrance */}
      <span className="toast-scan" style={{ '--toast-color': color } as React.CSSProperties} />

      <div className="flex items-start gap-2.5">
        <Icon size={14} style={{ color, marginTop: 1, flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-orbitron font-semibold tracking-wider" style={{ color }}>
            {toast.title.toUpperCase()}
          </div>
          {toast.message && (
            <div className="text-[10px] text-jarvis-muted mt-1 leading-relaxed break-words">
              {toast.message}
            </div>
          )}
        </div>
        <button onClick={onDone} className="flex-shrink-0" style={{ color: '#4a7a99' }}>
          <X size={12} />
        </button>
      </div>

      {/* Countdown bar */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: 'rgba(0,0,0,0.3)' }}>
        <motion.div
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: toast.duration / 1000, ease: 'linear' }}
          onAnimationComplete={onDone}
          className="progress-glow"
          style={{ height: '100%', background: color, color }}
        />
      </div>
    </motion.div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)
  const { lastMessage } = useWebSocket()

  const addToast = useCallback<AddToast>((t) => {
    const severity = t.severity ?? 'info'
    const duration = t.duration ?? (severity === 'error' || severity === 'critical' ? 8000 : 5000)
    const id = ++idRef.current
    setToasts(prev => [...prev.slice(-4), { id, title: t.title, message: t.message ?? '', severity, duration }])
    if (severity === 'error' || severity === 'critical' || severity === 'warning') playAlert()
    else playNotification()
  }, [])

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    if (!lastMessage) return
    if (lastMessage.event === 'notification') {
      const d = lastMessage.data as { title: string; message: string; severity: ToastSeverity }
      addToast({ title: d.title, message: d.message, severity: d.severity })
    }
  }, [lastMessage, addToast])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div
        style={{
          position: 'fixed', top: 46, right: 14, zIndex: 2000,
          display: 'flex', flexDirection: 'column', gap: 8,
          width: 300, pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {toasts.map(t => <ToastCard key={t.id} toast={t} onDone={() => remove(t.id)} />)}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
