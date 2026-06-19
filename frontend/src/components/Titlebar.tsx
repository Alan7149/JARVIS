import { Minus, Square, X, Maximize2, Minimize2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import ArcReactor from './ArcReactor'

declare global {
  interface Window {
    jarvis?: {
      minimize: () => void
      maximize: () => void
      close: () => void
      isMaximized: () => Promise<boolean>
      isDesktop?: boolean
    }
  }
}

export default function Titlebar() {
  const [maximized, setMaximized] = useState(false)
  const [time, setTime] = useState(new Date())
  const isDesktop = !!window.jarvis?.isDesktop

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!isDesktop) return
    const check = async () => {
      const m = await window.jarvis?.isMaximized()
      setMaximized(!!m)
    }
    check()
    const t = setInterval(check, 500)
    return () => clearInterval(t)
  }, [isDesktop])

  if (!isDesktop) return null

  return (
    <div
      className="titlebar-drag flex items-center justify-between px-4 border-b border-jarvis-border flex-shrink-0"
      style={{
        height: 36,
        background: 'rgba(2,8,20,0.95)',
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* Left — logo + title */}
      <div className="flex items-center gap-2.5">
        <ArcReactor size={22} />
        <span className="font-orbitron text-[11px] font-bold tracking-[0.3em] glow-text-sm">JARVIS</span>
        <span className="text-[8px] text-jarvis-muted tracking-widest font-mono hidden sm:block">
          PERSONAL AI SYSTEM v1.0
        </span>
      </div>

      {/* Center — live clock */}
      <div className="font-mono text-[10px] text-jarvis-muted tracking-widest absolute left-1/2 -translate-x-1/2 titlebar-nodrag">
        {time.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
        <span className="ml-3 opacity-50">{time.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      </div>

      {/* Right — window controls */}
      <div className="titlebar-nodrag flex items-center gap-1">
        <button
          onClick={() => window.jarvis?.minimize()}
          className="flex items-center justify-center w-7 h-7 rounded-sm text-jarvis-muted hover:text-jarvis-glow hover:bg-jarvis-border/30 transition-all"
          title="Minimize"
        >
          <Minus size={11} />
        </button>
        <button
          onClick={() => window.jarvis?.maximize()}
          className="flex items-center justify-center w-7 h-7 rounded-sm text-jarvis-muted hover:text-jarvis-glow hover:bg-jarvis-border/30 transition-all"
          title={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
        </button>
        <button
          onClick={() => window.jarvis?.close()}
          className="flex items-center justify-center w-7 h-7 rounded-sm text-jarvis-muted hover:text-jarvis-danger hover:bg-jarvis-danger/10 transition-all"
          title="Close to tray"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  )
}
