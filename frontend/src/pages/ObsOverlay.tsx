/**
 * JARVIS HUD Overlay — designed as an OBS Browser Source
 * URL: http://localhost:5173/obs-overlay
 * Size: 1920×1080, transparent background
 *
 * Shows: arc reactor, system vitals, typing speed, JARVIS status
 */
import { useEffect, useState, useRef } from 'react'
import ArcReactor from '../components/ArcReactor'
import { useWebSocket } from '../contexts/WebSocketContext'

interface SystemStatus {
  cpu_percent: number
  ram_percent: number
  ram_used_gb: number
  ram_total_gb: number
  battery?: { percent: number; plugged: boolean }
}

function Ring({ value, label, color, size = 80 }: {
  value: number; label: string; color: string; size?: number
}) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const dash = circ * (value / 100)

  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke={color} strokeWidth="5"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Orbitron, monospace', fontSize: 14, fontWeight: 700,
          color, textShadow: `0 0 8px ${color}`,
        }}>
          {Math.round(value)}
        </div>
      </div>
      <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 8, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.15em' }}>
        {label}
      </div>
    </div>
  )
}

function HudCorner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const styles: Record<string, React.CSSProperties> = {
    tl: { top: 0, left: 0, borderTop: '2px solid', borderLeft: '2px solid' },
    tr: { top: 0, right: 0, borderTop: '2px solid', borderRight: '2px solid' },
    bl: { bottom: 0, left: 0, borderBottom: '2px solid', borderLeft: '2px solid' },
    br: { bottom: 0, right: 0, borderBottom: '2px solid', borderRight: '2px solid' },
  }
  return (
    <div style={{
      position: 'absolute', width: 20, height: 20,
      borderColor: 'rgba(0,212,255,0.7)',
      ...styles[pos]
    }} />
  )
}

export default function ObsOverlay() {
  const { lastMessage } = useWebSocket()
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [time, setTime] = useState(new Date())
  const [jarvisStatus, setJarvisStatus] = useState('ONLINE')
  const [keystrokes, setKeystrokes] = useState(0)
  const keystrokeRef = useRef(0)

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (lastMessage?.event === 'system_status') {
      setStatus(lastMessage.data as SystemStatus)
    }
  }, [lastMessage])

  // Track typing speed
  useEffect(() => {
    const onKey = () => { keystrokeRef.current++ }
    window.addEventListener('keydown', onKey)
    const t = setInterval(() => {
      setKeystrokes(keystrokeRef.current)
      keystrokeRef.current = 0
    }, 60000)
    return () => { window.removeEventListener('keydown', onKey); clearInterval(t) }
  }, [])

  const cpu = status?.cpu_percent ?? 0
  const ram = status?.ram_percent ?? 0
  const battery = status?.battery?.percent ?? 100

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'transparent',
      fontFamily: 'Orbitron, JetBrains Mono, monospace',
      position: 'relative', overflow: 'hidden',
      pointerEvents: 'none',
    }}>
      {/* Scanline */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent)',
        animation: 'scanBeam 8s linear infinite',
        zIndex: 100,
      }} />

      {/* Top-left — JARVIS branding + arc reactor */}
      <div style={{
        position: 'absolute', top: 24, left: 24,
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(2,8,20,0.75)',
        border: '1px solid rgba(0,212,255,0.3)',
        padding: '10px 16px',
        backdropFilter: 'blur(8px)',
      }}>
        <HudCorner pos="tl" /> <HudCorner pos="br" />
        <ArcReactor size={36} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#00d4ff',
            textShadow: '0 0 15px rgba(0,212,255,0.8)', letterSpacing: '0.3em' }}>
            JARVIS
          </div>
          <div style={{ fontSize: 7, color: 'rgba(0,212,255,0.6)', letterSpacing: '0.3em' }}>
            {jarvisStatus} — AI SYSTEM v1.0
          </div>
        </div>
      </div>

      {/* Top-right — System vitals */}
      <div style={{
        position: 'absolute', top: 24, right: 24,
        background: 'rgba(2,8,20,0.75)',
        border: '1px solid rgba(0,212,255,0.25)',
        padding: '12px 20px',
        display: 'flex', gap: 20, alignItems: 'center',
        backdropFilter: 'blur(8px)',
      }}>
        <HudCorner pos="tl" /> <HudCorner pos="br" />
        <Ring value={cpu} label="CPU%" color={cpu > 80 ? '#ff3333' : '#00d4ff'} />
        <Ring value={ram} label="RAM%" color={ram > 80 ? '#ff9900' : '#00aaff'} />
        <Ring value={battery} label="BAT%" color={battery < 20 ? '#ff3333' : '#00ff88'} />
      </div>

      {/* Bottom-left — Live clock + date */}
      <div style={{
        position: 'absolute', bottom: 24, left: 24,
        background: 'rgba(2,8,20,0.75)',
        border: '1px solid rgba(0,212,255,0.2)',
        padding: '10px 16px',
        backdropFilter: 'blur(8px)',
      }}>
        <HudCorner pos="tl" /> <HudCorner pos="br" />
        <div style={{ fontSize: 28, fontWeight: 900, color: '#00d4ff',
          textShadow: '0 0 10px rgba(0,212,255,0.6)', letterSpacing: '0.1em' }}>
          {time.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
        </div>
        <div style={{ fontSize: 8, color: 'rgba(0,212,255,0.5)', letterSpacing: '0.2em', marginTop: 2 }}>
          {time.toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}
        </div>
      </div>

      {/* Bottom-right — Status bar */}
      <div style={{
        position: 'absolute', bottom: 24, right: 24,
        background: 'rgba(2,8,20,0.75)',
        border: '1px solid rgba(0,212,255,0.2)',
        padding: '10px 16px',
        backdropFilter: 'blur(8px)',
      }}>
        <HudCorner pos="tl" /> <HudCorner pos="br" />
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 7, color: 'rgba(0,212,255,0.5)', letterSpacing: '0.15em' }}>NET SENT</div>
            <div style={{ fontSize: 13, color: '#00d4ff', fontWeight: 700 }}>—</div>
          </div>
          <div style={{ width: 1, height: 24, background: 'rgba(0,212,255,0.2)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 7, color: 'rgba(0,212,255,0.5)', letterSpacing: '0.15em' }}>SYSTEM</div>
            <div style={{ fontSize: 11, color: '#00ff88', fontWeight: 700, letterSpacing: '0.1em' }}>NOMINAL</div>
          </div>
        </div>
      </div>

      {/* Center bottom — subtle data line */}
      <div style={{
        position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '40%', height: 2,
        background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent)',
      }} />
    </div>
  )
}
