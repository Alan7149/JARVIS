import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, MessageSquare, Bell, Cpu, Wifi, WifiOff, Smartphone, Mic, MicOff, Zap, Brain, MessageCircle, Music, Code2, Globe, Settings, FolderGit2, CalendarDays } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'
import { useWebSocket } from '../contexts/WebSocketContext'
import { useJarvisState } from '../contexts/JarvisStateContext'
import ArcReactor from './ArcReactor'
import Titlebar from './Titlebar'
import VoiceWave from './VoiceWave'
import JarvisAvatar from './JarvisAvatar'
import { ParticleCanvas, DataStreams, FullWaveform, GlitchOverlay } from './JarvisAnimations'
import { apiFetch } from '../lib/api'
import { playClick, playHover } from '../lib/sounds'

function WakeWordToggle() {
  const [active, setActive] = useState(false)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    setLoading(true)
    try {
      const endpoint = active ? '/api/wake-word/stop' : '/api/wake-word/start'
      await apiFetch(endpoint, { method: 'POST' })
      setActive(a => !a)
    } catch {}
    setLoading(false)
  }

  return (
    <div className="px-4 py-3 border-t border-jarvis-border/50">
      <button onClick={toggle} disabled={loading}
        className="w-full flex items-center justify-between px-3 py-2 rounded-sm transition-all"
        style={{
          background: active ? 'rgba(0,255,136,0.07)' : 'rgba(4,22,40,0.5)',
          border: `1px solid ${active ? 'rgba(0,255,136,0.3)' : 'rgba(13,74,110,0.4)'}`,
        }}>
        <div className="flex items-center gap-2">
          {active
            ? <Mic size={11} style={{ color: '#00ff88' }} />
            : <MicOff size={11} style={{ color: '#4a7a99' }} />}
          <span className="text-[9px] font-orbitron tracking-widest"
            style={{ color: active ? '#00ff88' : '#4a7a99' }}>
            {loading ? 'LOADING...' : active ? 'WAKE WORD ON' : 'WAKE WORD OFF'}
          </span>
        </div>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: active ? '#00ff88' : '#4a7a99',
          animation: active ? 'statusPulse 2s ease-in-out infinite' : 'none',
        }} />
      </button>
      {active && (
        <p className="text-[8px] text-jarvis-muted mt-1.5 text-center tracking-wider">
          Say "Hey JARVIS" to activate
        </p>
      )}
    </div>
  )
}

const nav = [
  { to: '/',        icon: LayoutDashboard, label: 'STATUS',    desc: 'System Overview' },
  { to: '/intel',   icon: Globe,           label: 'INTEL',     desc: 'World Intelligence' },
  { to: '/settings',  icon: Settings,       label: 'SETTINGS',  desc: 'Configuration' },
  { to: '/chat',      icon: MessageSquare,  label: 'INTERFACE', desc: 'AI Conversation' },
  { to: '/alerts',   icon: Bell,           label: 'ALERTS',    desc: 'Monitor & Notify' },
  { to: '/advanced', icon: Zap,            label: 'ADVANCED',  desc: '8 AI Modules' },
  { to: '/music',    icon: Music,          label: 'MUSIC DJ',  desc: 'YouTube Music' },
  { to: '/brain',    icon: Brain,          label: 'BRAIN',     desc: 'Second Brain' },
  { to: '/whatsapp', icon: MessageCircle,  label: 'WHATSAPP',  desc: 'Messages' },
  { to: '/code',     icon: Code2,          label: 'CODE AI',   desc: 'Review & Improve' },
  { to: '/warroom',  icon: Globe,          label: 'WAR ROOM',  desc: 'Global Threat Map' },
  { to: '/gitlab',   icon: FolderGit2,     label: 'GITLAB',    desc: 'Merges & Commits' },
  { to: '/calendar', icon: CalendarDays,   label: 'CALENDAR',  desc: 'Schedule & Agenda' },
]

export default function Layout() {
  const { isConnected } = useWebSocket()
  const { state } = useJarvisState()
  const location = useLocation()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', position: 'relative', background: '#020b18' }}>
      {/* Background layers */}
      <div className="jarvis-bg" />
      <div className="hex-grid" />

      {/* Scanline */}
      <div className="scanline" />

      {/* Custom titlebar */}
      <Titlebar />

      {/* Voice waveform — floats above content when JARVIS speaks */}
      <VoiceWave />
      <JarvisAvatar />
      <ParticleCanvas />
      <DataStreams />
      <FullWaveform />
      <GlitchOverlay />

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative', zIndex: 10 }}>

        {/* Sidebar */}
        <aside style={{
          width: 208, minWidth: 208, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          position: 'relative',
          background: 'rgba(2,8,20,0.97)',
          borderRight: '1px solid rgba(13,74,110,0.7)',
          zIndex: 20,
        }}>
          {/* Logo area */}
          <div className="px-5 py-5 border-b border-jarvis-border/50">
            <div className="flex items-center gap-3 mb-2">
              <ArcReactor size={42} state={state} />
              <div>
                <div className="font-orbitron text-lg font-black tracking-[0.3em] glow-text leading-none">
                  JARVIS
                </div>
                <div className="text-[8px] text-jarvis-muted tracking-[0.2em] mt-0.5">
                  AI SYSTEM
                </div>
              </div>
            </div>

            {/* Status indicator */}
            <div className="flex items-center gap-2 mt-3 px-2 py-1.5 rounded"
              style={{
                background: isConnected ? 'rgba(0,255,136,0.05)' : 'rgba(255,51,51,0.05)',
                border: `1px solid ${isConnected ? 'rgba(0,255,136,0.2)' : 'rgba(255,51,51,0.2)'}`,
              }}
            >
              <div className={clsx('status-dot', !isConnected && 'offline')} />
              <span className="text-[9px] tracking-widest font-orbitron"
                style={{ color: isConnected ? '#00ff88' : '#ff3333' }}>
                {isConnected ? 'CORE ONLINE' : 'CONNECTING'}
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {nav.map(({ to, icon: Icon, label, desc }) => {
              const isActive = to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(to)
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={() => playClick()}
                  onMouseEnter={() => playHover()}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-sm transition-all duration-200 group relative',
                    isActive ? 'nav-active' : 'text-jarvis-muted hover:text-jarvis-text border border-transparent hover:border-jarvis-border/30 hover:bg-jarvis-border/10'
                  )}
                >
                  {/* Active indicator bar */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                      style={{ background: '#00d4ff', boxShadow: '0 0 6px #00d4ff' }} />
                  )}
                  <Icon size={13} className="flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] tracking-[0.15em] font-orbitron font-semibold">{label}</div>
                    <div className="text-[8px] tracking-wider opacity-50 mt-0.5">{desc}</div>
                  </div>
                </NavLink>
              )
            })}
          </nav>

          {/* Wake Word Toggle */}
          <WakeWordToggle />

          {/* Footer */}
          <div className="px-5 py-3 border-t border-jarvis-border/50 space-y-1">
            <div className="flex items-center justify-between text-[8px] text-jarvis-muted tracking-widest">
              <span>VERSION</span>
              <span style={{ color: '#00d4ff' }}>1.0.0</span>
            </div>
            <div className="flex items-center justify-between text-[8px] text-jarvis-muted tracking-widest">
              <span>STATUS</span>
              <span style={{ color: '#00ff88' }}>OPERATIONAL</span>
            </div>
            <div className="flex items-center justify-between text-[8px] text-jarvis-muted tracking-widest">
              <span>AI ENGINE</span>
              <span style={{ color: '#00aaff' }}>GROQ/LLAMA</span>
            </div>
          </div>

          {/* Sidebar edge glow */}
          <div className="absolute right-0 top-0 bottom-0 w-px"
            style={{ background: 'linear-gradient(180deg, transparent, rgba(0,212,255,0.3), transparent)' }} />
        </aside>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
          {/* Top edge glow */}
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.2), transparent)' }} />
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              style={{ position: 'relative', height: '100%' }}
            >
              <motion.div
                className="page-wipe"
                initial={{ top: '0%', opacity: 1 }}
                animate={{ top: '100%', opacity: 0 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              />
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
